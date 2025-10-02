import type { AppConfig } from '../config';

import {
  ColumnDefinitionBuilder,
  ColumnType,
  Generated,
  Kysely,
  PostgresDialect,
  sql,
} from 'kysely';
import pg from 'pg';

export interface GroupChatsTable {
  id: string;
  name: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface EventsTable {
  id: string;
  group_chat_id: string;
  owner_id: string;
  owner_name: string;
  owner_slug: string;
  sequence: number;
  status: 'planning' | 'end';
  event_date: ColumnType<Date | null, Date | string | null, Date | string | null>;
  venue_url: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
  updated_at: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface EventAttendeesTable {
  event_id: string;
  name: string;
  normalized_name: string;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface EventPaymentsTable {
  id: Generated<number>;
  event_id: string;
  payer_name: string;
  normalized_name: string;
  amount: number;
  note: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface Database {
  group_chats: GroupChatsTable;
  events: EventsTable;
  event_attendees: EventAttendeesTable;
  event_payments: EventPaymentsTable;
}

export async function initDatabase(config: AppConfig): Promise<Kysely<Database>> {
  const { Pool } = pg;

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.pgssl ? { rejectUnauthorized: false } : undefined,
  });

  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  await migrateToLatest(db);
  return db;
}

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('group_chats')
    .ifNotExists()
    .addColumn('id', 'text', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('name', 'text')
    .addColumn('created_at', 'timestamptz', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable('events')
    .ifNotExists()
    .addColumn('id', 'text', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('group_chat_id', 'text', (col: ColumnDefinitionBuilder) =>
      col.notNull().references('group_chats.id').onDelete('cascade'),
    )
    .addColumn('owner_id', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('owner_name', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('owner_slug', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('sequence', 'integer', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('status', 'text', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo('planning'),
    )
    .addColumn('event_date', 'date')
    .addColumn('venue_url', 'text')
    .addColumn('created_at', 'timestamptz', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('events_owner_sequence_unique', ['group_chat_id', 'owner_id', 'sequence'])
    .execute();

  await db.schema
    .createTable('event_attendees')
    .ifNotExists()
    .addColumn('event_id', 'text', (col: ColumnDefinitionBuilder) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('name', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('normalized_name', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('event_attendees_pk', ['event_id', 'normalized_name'])
    .execute();

  await db.schema
    .createTable('event_payments')
    .ifNotExists()
    .addColumn('id', 'serial', (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn('event_id', 'text', (col: ColumnDefinitionBuilder) =>
      col.notNull().references('events.id').onDelete('cascade'),
    )
    .addColumn('payer_name', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('normalized_name', 'text', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('amount', 'integer', (col: ColumnDefinitionBuilder) => col.notNull())
    .addColumn('note', 'text')
    .addColumn('created_at', 'timestamptz', (col: ColumnDefinitionBuilder) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function destroyDatabase(db: Kysely<Database>): Promise<void> {
  await db.destroy();
}
