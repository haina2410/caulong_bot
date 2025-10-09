import { login } from 'ws3-fca';
import type { API, Message, ListenEvent } from 'ws3-fca';

import type { PlatformAdapter, PlatformContext } from '../platforms/types';

function normalizeCommand(text: string | undefined | null): string | null {
  if (!text) {
    return null;
  }

  const trimmed = text.trimStart();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'cl') {
    return 'cl';
  }

  if (lower.startsWith('cl ')) {
    return `cl${trimmed.slice(2)}`;
  }

  return null;
}

async function getThreadName(api: API, threadId: string): Promise<string | null> {
  return new Promise((resolve) => {
    void api.getThreadInfo(threadId, (error, info) => {
      if (error) {
        resolve(null);
        return;
      }

      resolve(info?.threadName ?? null);
    });
  });
}

async function loginAsync(credentials: {
  email?: string;
  password?: string;
  appState?: unknown;
}): Promise<API> {
  return new Promise((resolve, reject) => {
    login(
      credentials,
      {
        online: true,
        updatePresence: false,
        selfListen: false,
        randomUserAgent: false,
        listenEvents: true,
      },
      (error, api) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(api);
      },
    );
  });
}

export function createMessengerAdapter(context: PlatformContext): PlatformAdapter {
  const logPrefix = '[messenger]';
  let api: API | undefined;
  let stopListening: (() => void) | undefined;

  const handleMessage = async (event: ListenEvent) => {
    if (!api) {
      console.warn(`${logPrefix} Received event while API not initialized`);
      return;
    }

    if (event.type !== 'message') {
      console.debug(`${logPrefix} Ignoring non-message event`, {
        type: event.type,
      });
      return;
    }

    const message = event as Message;
    if (!message.isGroup) {
      console.debug(`${logPrefix} Ignoring non-group message`, {
        threadId: message.threadID,
        isGroup: message.isGroup,
      });
      return;
    }

    const normalizedCommand = normalizeCommand(message.body);
    if (!normalizedCommand) {
      console.debug(`${logPrefix} Ignoring message that is not a supported command`, {
        threadId: message.threadID,
        senderId: message.senderID,
        bodySample: message.body?.slice(0, 50),
      });
      return;
    }

    console.log(`${logPrefix} Handling command`, {
      threadId: message.threadID,
      senderId: message.senderID,
      body: normalizedCommand,
      original: message.body,
    });

    const threadName = await getThreadName(api, message.threadID);

    try {
      const result = await context.handleCommand({
        db: context.db,
        body: normalizedCommand,
        senderId: message.senderID,
        senderName: 'Unknown',
        threadId: message.threadID,
        threadName,
      });

      console.log(`${logPrefix} Command handled successfully, sending response`, {
        threadId: message.threadID,
      });
      api.sendMessageMqtt(result.response, message.threadID, message.messageID, (sendError) => {
        if (sendError) {
          console.error('Failed to send Messenger response', sendError);
        }
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${logPrefix} Command handling failed`, {
        threadId: message.threadID,
        senderId: message.senderID,
        error,
      });
      api.sendMessageMqtt(`⚠️ ${messageText}`, message.threadID, message.messageID, (sendError) => {
        if (sendError) {
          console.error('Failed to send Messenger error response', sendError);
        }
      });
    }
  };

  return {
    async start() {
      if (api) {
        console.warn(`${logPrefix} Adapter already started`);
        return;
      }

      const credentials = (() => {
        if (context.config.appState) {
          return { appState: context.config.appState };
        }

        if (context.config.fbEmail && context.config.fbPassword) {
          return { email: context.config.fbEmail, password: context.config.fbPassword };
        }

        throw new Error(
          'Messenger credentials missing. Configure FB_APPSTATE_PATH or FB_EMAIL/FB_PASSWORD.',
        );
      })();

      console.log(`${logPrefix} Logging in with provided credentials`);
      api = await loginAsync(credentials);
      console.log(`${logPrefix} Login successful as: ${api.getCurrentUserID()}`);

      stopListening = api.listenMqtt((error, event) => {
        if (error) {
          console.error('Messenger listener error', error);
          return;
        }

        console.debug(`${logPrefix} Event received from MQTT`, {
          type: event.type,
          threadId: event.threadID,
          isGroup: event.isGroup,
        });
        void handleMessage(event);
      });
      console.log(`${logPrefix} Bot is now listening for messages`);
    },
    async stop() {
      if (!api) {
        console.warn(`${logPrefix} Adapter stop requested but API not initialized`);
        return;
      }

      console.log(`${logPrefix} Stopping listener`);
      stopListening?.();
      stopListening = undefined;
      api = undefined;
      console.log(`${logPrefix} Bot stopped`);
    },
  };
}
