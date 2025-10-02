import TelegramBot from 'node-telegram-bot-api';

import type { PlatformAdapter, PlatformContext } from './types';

function isGroupChat(type: TelegramBot.Chat['type']): boolean {
  return type === 'group' || type === 'supergroup';
}

function isCommand(text: string | undefined | null): text is string {
  if (!text) {
    return false;
  }

  return text.trimStart().toLowerCase().startsWith('cl ');
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
  let bot: TelegramBot | undefined;

  const handleMessage = async (message: TelegramBot.Message) => {
    if (!bot) {
      return;
    }

    if (!message.text || !isGroupChat(message.chat.type)) {
      return;
    }

    if (!isCommand(message.text)) {
      return;
    }

    if (message.from?.is_bot) {
      return;
    }

    const senderId = message.from?.id;
    if (!senderId) {
      return;
    }

    const threadId = String(message.chat.id);
    const threadName = message.chat.title ?? message.chat.username ?? null;

    try {
      const result = await context.handleCommand({
        db: context.db,
        body: message.text,
        senderId: String(senderId),
        senderName: formatSenderName(message),
        threadId,
        threadName,
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
        return;
      }

      const token = context.config.telegramToken;
      if (!token) {
        throw new Error('TELEGRAM_TOKEN is required to start the Telegram adapter.');
      }

      bot = new TelegramBot(token, { polling: true });

      bot.on('message', (message: TelegramBot.Message) => {
        void handleMessage(message);
      });

      bot.on('polling_error', (error: Error) => {
        console.error('Telegram polling error', error);
      });
    },
    async stop() {
      if (!bot) {
        return;
      }

  await bot.stopPolling();
      bot.removeAllListeners('message');
      bot.removeAllListeners('polling_error');
      bot = undefined;
    },
  };
}
