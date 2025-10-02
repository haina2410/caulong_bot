/* Legacy messenger command implementation retained for reference.
import type { Kysely, Selectable } from 'kysely';

import type { Database, EventsTable } from '../services/database';
import {
  addAttendee,
  addPayment,
  createEvent,
  endEvent,
  getLatestEvent,
  getPlanningEvent,
  getEventSummary,
  setEventDate,
  setEventVenue,
  summarizeEvent,
} from '../services/eventService';
import {
  formatCurrency,
  formatEventLabel,
  normalizeName,
  parseAmount,
  parseCommandDate,
} from '../utils/text';

export interface CommandContext {
  db: Kysely<Database>;
  threadId: string;
  threadName?: string | null;
  senderId: string;
  senderName: string;
  body: string;
}

export interface CommandResult {
  response: string;
}

function requireBody(body: string | null | undefined): string {
  if (!body || !body.trim()) {
    throw new Error('Command body is empty');
  }

  return body.trim();
}

async function getActiveEventOrThrow(
  db: Kysely<Database>,
  threadId: string,
): Promise<Selectable<EventsTable>> {
  const event = await getPlanningEvent(db, threadId);
  if (!event) {
    throw new Error('No active badminton meetup. Use "cl create" to start one.');
  }

  return event;
}
*/

export { handleCommand } from '../bot/commands';
export type { CommandContext, CommandResult } from '../bot/commands';
