import 'dotenv/config';

import { loadConfig } from './config';
import { handleCommand } from './bot/commands';
import { createPlatformAdapter } from './platforms';
import { destroyDatabase, initDatabase } from './services/database';

async function main() {
  const config = await loadConfig();
  console.log(`[bootstrap] Loaded configuration for platform: ${config.platform}`);
  const db = await initDatabase(config);
  console.log('[bootstrap] Database connection established');

  const adapter = createPlatformAdapter({
    db,
    config,
    handleCommand,
  });
  console.log(`[bootstrap] Selected platform adapter: ${config.platform}`);

  const abortController = new AbortController();
  const waitForStop = new Promise<void>((resolve) => {
    if (abortController.signal.aborted) {
      resolve();
      return;
    }

    abortController.signal.addEventListener('abort', () => resolve(), { once: true });
  });

  const handleShutdown = () => {
    console.log('[bootstrap] Shutdown signal received');
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };

  process.once('SIGINT', handleShutdown);
  process.once('SIGTERM', handleShutdown);

  try {
    console.log('[bootstrap] Starting platform adapter');
    await adapter.start();
    console.log('[bootstrap] Platform adapter started, waiting for stop signal');
    await waitForStop;
  } finally {
    process.removeListener('SIGINT', handleShutdown);
    process.removeListener('SIGTERM', handleShutdown);

    console.log('[bootstrap] Stopping platform adapter');
    await adapter.stop();
    console.log('[bootstrap] Destroying database connection');
    await destroyDatabase(db);
  }
}

void main().catch((error) => {
  console.error('Fatal error while starting bot', error);
  process.exitCode = 1;
});
