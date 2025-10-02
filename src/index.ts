import 'dotenv/config';

import { loadConfig } from './config';
import { handleCommand } from './bot/commands';
import { createPlatformAdapter } from './platforms';
import { destroyDatabase, initDatabase } from './services/database';

async function main() {
  const config = await loadConfig();
  const db = await initDatabase(config);

  const adapter = createPlatformAdapter({
    db,
    config,
    handleCommand,
  });

  const abortController = new AbortController();
  const waitForStop = new Promise<void>((resolve) => {
    if (abortController.signal.aborted) {
      resolve();
      return;
    }

    abortController.signal.addEventListener('abort', () => resolve(), { once: true });
  });

  const handleShutdown = () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };

  process.once('SIGINT', handleShutdown);
  process.once('SIGTERM', handleShutdown);

  try {
    await adapter.start();
    await waitForStop;
  } finally {
    process.removeListener('SIGINT', handleShutdown);
    process.removeListener('SIGTERM', handleShutdown);

    await adapter.stop();
    await destroyDatabase(db);
  }
}

void main().catch((error) => {
  console.error('Fatal error while starting bot', error);
  process.exitCode = 1;
});
