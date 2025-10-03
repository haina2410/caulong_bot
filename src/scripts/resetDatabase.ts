import 'dotenv/config';

import { sql } from 'kysely';

import { loadConfig } from '../config';
import { destroyDatabase, initDatabase } from '../services/database';

async function main(): Promise<void> {
  const config = await loadConfig();
  const db = await initDatabase(config);

  try {
    await sql`truncate table event_payments restart identity cascade`.execute(db);
    await sql`truncate table event_attendees restart identity cascade`.execute(db);
    await sql`truncate table events restart identity cascade`.execute(db);
    await sql`truncate table group_chats restart identity cascade`.execute(db);
    console.log('Database tables have been truncated.');
  } finally {
    await destroyDatabase(db);
  }
}

void main().catch((error) => {
  console.error('Failed to reset database', error);
  process.exitCode = 1;
});
