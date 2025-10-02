import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const baseConfigSchema = z.object({
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  pgssl: z.boolean().default(false),
  fbEmail: z.string().optional(),
  fbPassword: z.string().optional(),
  fbAppStatePath: z.string().optional(),
});

const configSchema = baseConfigSchema.superRefine(
  (value: z.infer<typeof baseConfigSchema>, ctx: z.RefinementCtx) => {
    if (!value.fbAppStatePath && !(value.fbEmail && value.fbPassword)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide FB_APPSTATE_PATH or both FB_EMAIL and FB_PASSWORD',
        path: ['fbAppStatePath'],
      });
    }
  }
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
    fbEmail: process.env.FB_EMAIL,
    fbPassword: process.env.FB_PASSWORD,
    fbAppStatePath: process.env.FB_APPSTATE_PATH,
  });

  const appState = await readAppState(parsed.fbAppStatePath);

  return { ...parsed, appState };
}
