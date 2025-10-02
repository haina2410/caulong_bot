import login from 'facebook-chat-api';
import type { Api, MessageEvent } from 'facebook-chat-api';
import type { Kysely } from 'kysely';

import type { AppConfig } from '../config';
import type { Database } from '../services/database';
import { ensureGroupChat } from '../services/eventService';
import { handleCommand } from './commands';

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

async function processEvent(api: Api, db: Kysely<Database>, event: MessageEvent): Promise<void> {
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

  await ensureGroupChat(db, { id: event.threadID, name: threadName ?? null });

  try {
    const result = await handleCommand({
      db,
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
}

export async function createBot(db: Kysely<Database>, config: AppConfig): Promise<void> {
  const credentials = config.appState
    ? { appState: config.appState }
    : { email: config.fbEmail, password: config.fbPassword };

  const api = await loginAsync(credentials);

  api.setOptions({
    selfListen: false,
    listenEvents: true,
    updatePresence: false,
    logLevel: 'silent',
  });

  await new Promise<void>((resolve) => {
    const stopListening = api.listenMqtt((error, event) => {
      if (error) {
        console.error('Messenger listener error', error);
        return;
      }

      void processEvent(api, db, event).catch((listenerError) => {
        console.error('Failed to process messenger event', listenerError);
      });
    });

    const cleanup = () => {
      stopListening();
      resolve();
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  });
}
