import type { Kysely } from 'kysely';

import type { AppConfig } from '../config';
import type { CommandContext, CommandResult } from '../bot/commands';
import type { Database } from '../services/database';

export interface CommandHandler {
  (context: CommandContext): Promise<CommandResult>;
}

export interface PlatformContext {
  db: Kysely<Database>;
  config: AppConfig;
  handleCommand: CommandHandler;
}

export interface PlatformAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
}
