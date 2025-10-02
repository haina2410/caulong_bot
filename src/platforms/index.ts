import { createMessengerAdapter } from '../messenger/bot';

import type { PlatformAdapter, PlatformContext } from './types';
import { createDiscordAdapter } from './discord';
import { createTelegramAdapter } from './telegram';

export function createPlatformAdapter(context: PlatformContext): PlatformAdapter {
  switch (context.config.platform) {
    case 'messenger':
      return createMessengerAdapter(context);
    case 'discord':
      return createDiscordAdapter(context);
    case 'telegram':
      return createTelegramAdapter(context);
    default: {
      const exhaustiveCheck: never = context.config.platform;
      throw new Error(`Unsupported platform: ${exhaustiveCheck}`);
    }
  }
}
