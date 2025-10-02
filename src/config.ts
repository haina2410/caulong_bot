import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const platformSchema = z.enum(['messenger', 'discord', 'telegram']);

const baseConfigSchema = z.object({
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  pgssl: z.boolean().default(false),
  platform: platformSchema.default('messenger'),
  fbEmail: z.string().optional(),
  fbPassword: z.string().optional(),
  fbAppStatePath: z.string().optional(),
  discordToken: z.string().optional(),
  telegramToken: z.string().optional(),
});

const configSchema = baseConfigSchema.superRefine(
  (value: z.infer<typeof baseConfigSchema>, ctx: z.RefinementCtx) => {
    if (value.platform === 'messenger') {
      if (!value.fbAppStatePath && !(value.fbEmail && value.fbPassword)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Provide FB_APPSTATE_PATH or both FB_EMAIL and FB_PASSWORD',
          path: ['fbAppStatePath'],
        });
      }
      return;
    }

    if (value.platform === 'discord' && !value.discordToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DISCORD_TOKEN is required when PLATFORM=discord',
        path: ['discordToken'],
      });
      return;
    }

    if (value.platform === 'telegram' && !value.telegramToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TELEGRAM_TOKEN is required when PLATFORM=telegram',
        path: ['telegramToken'],
      });
    }
  },
);

export type AppConfig = z.infer<typeof configSchema> & { appState?: unknown };

async function readAppState(appStatePath: string | undefined): Promise<unknown | undefined> {
  if (!appStatePath) {
    return undefined;
  }

  const resolved = path.resolve(appStatePath);
  const raw = await fs.readFile(resolved, 'utf-8');
  return JSON.parse(raw);
}

export async function loadConfig(): Promise<AppConfig> {
  const parsed = configSchema.parse({
    databaseUrl: process.env.DATABASE_URL,
    pgssl: process.env.PGSSL === 'true',
    platform: process.env.PLATFORM,
    fbEmail: process.env.FB_EMAIL,
    fbPassword: process.env.FB_PASSWORD,
    fbAppStatePath: process.env.FB_APPSTATE_PATH,
    discordToken: process.env.DISCORD_TOKEN,
    telegramToken: process.env.TELEGRAM_TOKEN,
  });

  const appState = await readAppState(parsed.fbAppStatePath);

  return { ...parsed, appState };
}
