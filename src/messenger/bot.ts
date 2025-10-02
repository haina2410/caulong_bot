import login from 'facebook-chat-api';
import type { Api, MessageEvent } from 'facebook-chat-api';

import type { PlatformAdapter, PlatformContext } from '../platforms/types';

async function loginAsync(credentials: {
  email?: string;
  password?: string;
  appState?: unknown;
}): Promise<Api> {
  return new Promise((resolve, reject) => {
    login(credentials, (error, api) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(api);
    });
  });
}

async function getThreadName(api: Api, threadId: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    api.getThreadInfo(threadId, (error, info) => {
      if (error) {
        resolve(undefined);
        return;
      }

      resolve(info?.threadName ?? undefined);
    });
  });
}

function isCommand(body: string | null | undefined): body is string {
  if (!body) {
    return false;
  }

  return body.trimStart().toLowerCase().startsWith('cl ');
}

export function createMessengerAdapter(context: PlatformContext): PlatformAdapter {
  const logPrefix = '[messenger]';
  let api: Api | undefined;
  let stopListening: (() => void) | undefined;

  const processEvent = async (event: MessageEvent) => {
    if (!api) {
      console.warn(`${logPrefix} Received event while API not initialized`, {
        threadId: event.threadID,
        type: event.type,
      });
      return;
    }

    if (event.type !== 'message') {
      console.debug(`${logPrefix} Ignoring non-message event`, {
        type: event.type,
        threadId: event.threadID,
      });
      return;
    }

    if (!event.isGroup) {
      console.debug(`${logPrefix} Ignoring direct message`, {
        threadId: event.threadID,
        senderId: event.senderID,
      });
      return;
    }

    if (!isCommand(event.body)) {
      console.debug(`${logPrefix} Ignoring non-command message`, {
        threadId: event.threadID,
        senderId: event.senderID,
      });
      return;
    }

    console.log(`${logPrefix} Handling command`, {
      threadId: event.threadID,
      senderId: event.senderID,
      body: event.body,
    });

    const threadName = event.threadName ?? (await getThreadName(api, event.threadID));

    try {
      const result = await context.handleCommand({
        db: context.db,
        body: event.body,
        senderId: event.senderID,
        senderName: event.senderName ?? 'Unknown',
        threadId: event.threadID,
        threadName,
      });

      console.log(`${logPrefix} Command handled successfully, sending response`, {
        threadId: event.threadID,
      });
      await Promise.resolve(api.sendMessage(result.response, event.threadID));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${logPrefix} Command handling failed`, {
        threadId: event.threadID,
        senderId: event.senderID,
        error,
      });
      await Promise.resolve(api.sendMessage(`⚠️ ${message}`, event.threadID));
    }
  };

  const getCredentials = () => {
    if (context.config.appState) {
      return { appState: context.config.appState } as const;
    }

    if (context.config.fbEmail && context.config.fbPassword) {
      return { email: context.config.fbEmail, password: context.config.fbPassword } as const;
    }

    throw new Error(
      'Messenger credentials missing. Configure FB_APPSTATE_PATH or FB_EMAIL/FB_PASSWORD.',
    );
  };

  return {
    async start() {
      if (api) {
        console.warn(`${logPrefix} Adapter already started`);
        return;
      }

      const credentials = getCredentials();
      console.log(`${logPrefix} Logging in with provided credentials`);
      api = await loginAsync(credentials);
      console.log(`${logPrefix} Login successful`);

      api.setOptions({
        selfListen: false,
        listenEvents: true,
        updatePresence: false,
        logLevel: 'silent',
      });
      console.log(`${logPrefix} Messenger options configured`);

      stopListening = api.listenMqtt((error, event) => {
        if (error) {
          console.error('Messenger listener error', error);
          return;
        }

        console.debug(`${logPrefix} Event received from MQTT`, {
          type: event.type,
          threadId: event.threadID,
        });
        void processEvent(event).catch((listenerError) => {
          console.error('Failed to process messenger event', listenerError);
        });
      });
      console.log(`${logPrefix} Listening for incoming events`);
    },
    async stop() {
      console.log(`${logPrefix} Stopping adapter`);
      stopListening?.();
      stopListening = undefined;
      api = undefined;
    },
  };
}
