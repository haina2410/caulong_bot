import 'dotenv/config';

import { loadConfig } from './config';
import { createBot } from './messenger/bot';
import { destroyDatabase, initDatabase } from './services/database';

async function main() {
  const config = await loadConfig();
  const db = await initDatabase(config);

  try {
    await createBot(db, config);
  } finally {
    await destroyDatabase(db);
  }
}

void main().catch((error) => {
  console.error('Fatal error while starting bot', error);
  process.exitCode = 1;
});
