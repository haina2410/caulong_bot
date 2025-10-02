import TelegramBot from 'node-telegram-bot-api';

import type { PlatformAdapter, PlatformContext } from './types';

function isGroupChat(type: TelegramBot.Chat['type']): boolean {
  return type === 'group' || type === 'supergroup';
}

function normalizeCommand(text: string | undefined | null): string | null {
  if (!text) {
    return null;
  }

  const trimmed = text.trimStart();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    const withoutSlash = trimmed.slice(1);
    const match = withoutSlash.match(/^(cl)(?:@[\w_]+)?(?:(\s.*)|$)/i);
    if (!match) {
      return null;
    }

    const remainder = match[2] ?? '';
    return `cl${remainder}`;
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

function formatSenderName(message: TelegramBot.Message): string {
  const from = message.from;
  if (!from) {
    return 'Unknown';
  }

  const parts = [from.first_name, from.last_name].filter(Boolean);
  if (parts.length) {
    return parts.join(' ');
  }

  return from.username ?? 'Unknown';
}

export function createTelegramAdapter(context: PlatformContext): PlatformAdapter {
  const logPrefix = '[telegram]';
  let bot: TelegramBot | undefined;

  const handleMessage = async (message: TelegramBot.Message) => {
    if (!bot) {
      console.warn(`${logPrefix} Received message while bot not initialized`, {
        chatId: message.chat.id,
      });
      return;
    }

    if (!message.text || !isGroupChat(message.chat.type)) {
      console.debug(`${logPrefix} Ignoring non-text or non-group message`, {
        chatId: message.chat.id,
        type: message.chat.type,
      });
      return;
    }

    const normalizedCommand = normalizeCommand(message.text);
    if (!normalizedCommand) {
      console.debug(`${logPrefix} Ignoring message that is not a supported command`, {
        chatId: message.chat.id,
        senderId: message.from?.id,
        textSample: message.text.slice(0, 50),
      });
      return;
    }

    if (message.from?.is_bot) {
      console.debug(`${logPrefix} Ignoring message from bot user`, {
        chatId: message.chat.id,
        senderId: message.from.id,
      });
      return;
    }

    const senderId = message.from?.id;
    if (!senderId) {
      console.warn(`${logPrefix} Missing sender id`, {
        chatId: message.chat.id,
      });
      return;
    }

    console.log(`${logPrefix} Handling command`, {
      chatId: message.chat.id,
      senderId,
      body: normalizedCommand,
      original: message.text,
    });

    const threadId = String(message.chat.id);
    const threadName = message.chat.title ?? message.chat.username ?? null;

    try {
      const result = await context.handleCommand({
        db: context.db,
        body: normalizedCommand,
        senderId: String(senderId),
        senderName: formatSenderName(message),
        threadId,
        threadName,
      });

      console.log(`${logPrefix} Command handled successfully, sending response`, {
        chatId: message.chat.id,
      });
      await bot
        .sendMessage(message.chat.id, result.response, {
          reply_to_message_id: message.message_id,
        })
        .catch((sendError: unknown) => {
          console.error('Failed to send Telegram response', sendError);
        });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown error';
      console.error(`${logPrefix} Command handling failed`, {
        chatId: message.chat.id,
        senderId,
        error,
      });
      await bot
        .sendMessage(message.chat.id, `⚠️ ${messageText}`, {
          reply_to_message_id: message.message_id,
        })
        .catch((sendError: unknown) => {
          console.error('Failed to send Telegram error response', sendError);
        });
    }
  };

  return {
    async start() {
      if (bot) {
        console.warn(`${logPrefix} Adapter already started`);
        return;
      }

      const token = context.config.telegramToken;
      if (!token) {
        throw new Error('TELEGRAM_TOKEN is required to start the Telegram adapter.');
      }

      console.log(`${logPrefix} Starting bot with polling transport`);
      bot = new TelegramBot(token, { polling: true });

      bot.on('message', (message: TelegramBot.Message) => {
        console.debug(`${logPrefix} Message received`, {
          chatId: message.chat.id,
          type: message.chat.type,
          isBot: message.from?.is_bot,
        });
        void handleMessage(message);
      });

      bot.on('polling_error', (error: Error) => {
        console.error('Telegram polling error', error);
      });
      console.log(`${logPrefix} Bot is now listening for messages`);
    },
    async stop() {
      if (!bot) {
        console.warn(`${logPrefix} Adapter stop requested but bot not initialized`);
        return;
      }

      console.log(`${logPrefix} Stopping bot polling`);
      await bot.stopPolling();
      bot.removeAllListeners('message');
      bot.removeAllListeners('polling_error');
      bot = undefined;
      console.log(`${logPrefix} Bot stopped`);
    },
  };
}
