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
  let api: Api | undefined;
  let stopListening: (() => void) | undefined;

  const processEvent = async (event: MessageEvent) => {
    if (!api) {
      return;
    }

    if (event.type !== 'message') {
      return;
    }

    if (!event.isGroup) {
      return;
    }

    if (!isCommand(event.body)) {
      return;
    }

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

      await Promise.resolve(api.sendMessage(result.response, event.threadID));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
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
        return;
      }

      const credentials = getCredentials();
      api = await loginAsync(credentials);

      api.setOptions({
        selfListen: false,
        listenEvents: true,
        updatePresence: false,
        logLevel: 'silent',
      });

      stopListening = api.listenMqtt((error, event) => {
        if (error) {
          console.error('Messenger listener error', error);
          return;
        }

        void processEvent(event).catch((listenerError) => {
          console.error('Failed to process messenger event', listenerError);
        });
      });
    },
    async stop() {
      stopListening?.();
      stopListening = undefined;
      api = undefined;
    },
  };
}
