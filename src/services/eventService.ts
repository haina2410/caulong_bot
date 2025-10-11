import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';

import type { Database, EventAttendeesTable, EventPaymentsTable, EventsTable } from './database';
import { formatEventLabel, normalizeName, slugifyName } from '../utils/text';

export interface EventSummary {
  event: Selectable<EventsTable>;
  attendees: Array<Selectable<EventAttendeesTable>>;
  payments: Array<Selectable<EventPaymentsTable>>;
}

export interface CreateEventInput {
  groupChatId: string;
  groupChatName?: string | null;
  ownerId: string;
  ownerName: string;
}

export interface AddAttendeeInput {
  eventId: string;
  name: string;
}

export interface RemoveAttendeeInput {
  eventId: string;
  name: string;
}

export interface UpdateAttendeeGoInput {
  eventId: string;
  name: string;
  go: boolean;
}

export interface AddPaymentInput {
  eventId: string;
  payerName: string;
  amount: number;
  note?: string;
}

export interface UpdateDateInput {
  eventId: string;
  date: Date | null;
}

export interface UpdateVenueInput {
  eventId: string;
  venueUrl: string | null;
}

export async function ensureGroupChat(
  db: Kysely<Database>,
  input: { id: string; name?: string | null },
): Promise<void> {
  await db
    .insertInto('group_chats')
    .values({
      id: input.id,
      name: input.name ?? null,
      created_at: sql`now()`,
      updated_at: sql`now()`,
    })
    .onConflict((oc) =>
      oc.column('id').doUpdateSet({
        name: input.name ?? null,
        updated_at: sql`now()`,
      }),
    )
    .executeTakeFirst();
}

export async function createEvent(
  db: Kysely<Database>,
  input: CreateEventInput,
): Promise<Selectable<EventsTable>> {
  const ownerSlug = slugifyName(input.ownerName);

  return db.transaction().execute(async (trx) => {
    await ensureGroupChat(trx, {
      id: input.groupChatId,
      name: input.groupChatName ?? null,
    });

    const sequenceRow = await trx
      .selectFrom('events')
      .where('group_chat_id', '=', input.groupChatId)
      .where('owner_id', '=', input.ownerId)
      .select((eb) => eb.fn.max<number>('sequence').as('maxSequence'))
      .executeTakeFirst();

    const sequence = (sequenceRow?.maxSequence ?? 0) + 1;

    const eventId = `${input.groupChatId}:${ownerSlug}:${sequence}`;

    const inserted = await trx
      .insertInto('events')
      .values({
        id: eventId,
        group_chat_id: input.groupChatId,
        owner_id: input.ownerId,
        owner_name: input.ownerName,
        owner_slug: ownerSlug,
        sequence,
        status: 'planning',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await addAttendee(trx, {
      eventId,
      name: input.ownerName,
    });

    return inserted;
  });
}

export async function getPlanningEvent(
  db: Kysely<Database>,
  groupChatId: string,
): Promise<Selectable<EventsTable> | undefined> {
  return db
    .selectFrom('events')
    .where('group_chat_id', '=', groupChatId)
    .where('status', '=', 'planning')
    .selectAll()
    .orderBy('created_at desc')
    .executeTakeFirst();
}

export async function getLatestEvent(
  db: Kysely<Database>,
  groupChatId: string,
): Promise<Selectable<EventsTable> | undefined> {
  return db
    .selectFrom('events')
    .where('group_chat_id', '=', groupChatId)
    .selectAll()
    .orderBy('created_at desc')
    .executeTakeFirst();
}

export async function addAttendee(
  db: Kysely<Database> | Transaction<Database>,
  input: AddAttendeeInput,
): Promise<void> {
  const normalized_name = normalizeName(input.name);

  await db
    .insertInto('event_attendees')
    .values({
      event_id: input.eventId,
      name: input.name,
      normalized_name,
      go: true,
    })
    .onConflict((oc) =>
      oc.columns(['event_id', 'normalized_name']).doUpdateSet({
        name: input.name,
        go: true,
      }),
    )
    .executeTakeFirst();
}

export async function removeAttendee(
  db: Kysely<Database> | Transaction<Database>,
  input: RemoveAttendeeInput,
): Promise<boolean> {
  const normalized_name = normalizeName(input.name);

  const deleteResult = await db
    .deleteFrom('event_attendees')
    .where('event_id', '=', input.eventId)
    .where('normalized_name', '=', normalized_name)
    .executeTakeFirst();

  const deleted = Number(deleteResult?.numDeletedRows ?? 0) > 0;

  if (deleted) {
    await db
      .deleteFrom('event_payments')
      .where('event_id', '=', input.eventId)
      .where('normalized_name', '=', normalized_name)
      .executeTakeFirst();
  }

  return deleted;
}

export async function setAttendeeGo(
  db: Kysely<Database> | Transaction<Database>,
  input: UpdateAttendeeGoInput,
): Promise<boolean> {
  const normalized_name = normalizeName(input.name);

  const updateResult = await db
    .updateTable('event_attendees')
    .set({ go: input.go })
    .where('event_id', '=', input.eventId)
    .where('normalized_name', '=', normalized_name)
    .executeTakeFirst();

  return Number(updateResult?.numUpdatedRows ?? 0) > 0;
}

export async function setEventDate(db: Kysely<Database>, input: UpdateDateInput): Promise<void> {
  await db
    .updateTable('events')
    .set({ event_date: input.date, updated_at: sql`now()` })
    .where('id', '=', input.eventId)
    .executeTakeFirst();
}

export async function setEventVenue(db: Kysely<Database>, input: UpdateVenueInput): Promise<void> {
  await db
    .updateTable('events')
    .set({ venue_url: input.venueUrl, updated_at: sql`now()` })
    .where('id', '=', input.eventId)
    .executeTakeFirst();
}

export async function addPayment(
  db: Kysely<Database>,
  input: AddPaymentInput,
): Promise<Selectable<EventPaymentsTable>> {
  const normalized_name = normalizeName(input.payerName);

  return db
    .insertInto('event_payments')
    .values({
      event_id: input.eventId,
      payer_name: input.payerName,
      normalized_name,
      amount: input.amount,
      note: input.note ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function endEvent(db: Kysely<Database>, eventId: string): Promise<void> {
  await db
    .updateTable('events')
    .set({ status: 'end', updated_at: sql`now()` })
    .where('id', '=', eventId)
    .executeTakeFirst();
}

export async function getEventSummary(
  db: Kysely<Database>,
  eventId: string,
): Promise<EventSummary | undefined> {
  const event = await db
    .selectFrom('events')
    .where('id', '=', eventId)
    .selectAll()
    .executeTakeFirst();

  if (!event) {
    return undefined;
  }

  const attendees = await db
    .selectFrom('event_attendees')
    .where('event_id', '=', eventId)
    .selectAll()
    .execute();

  const payments = await db
    .selectFrom('event_payments')
    .where('event_id', '=', eventId)
    .selectAll()
    .execute();

  return { event, attendees, payments };
}

export function summarizeEvent(summary: EventSummary) {
  const participantMap = new Map<
    string,
    { name: string; normalized: string; go: boolean; prepaid: number; isAttendee: boolean }
  >();

  for (const attendee of summary.attendees) {
    participantMap.set(attendee.normalized_name, {
      name: attendee.name,
      normalized: attendee.normalized_name,
      go: Boolean(attendee.go),
      prepaid: 0,
      isAttendee: true,
    });
  }

  let courtCost = 0;
  let otherCost = 0;

  for (const payment of summary.payments) {
    const normalized = payment.normalized_name;

    if (normalized === 'san' || normalized === 'court') {
      courtCost += payment.amount;
      continue;
    }

    otherCost += payment.amount;

    const entry = participantMap.get(normalized) ?? {
      name: payment.payer_name,
      normalized,
      go: true,
      prepaid: 0,
      isAttendee: false,
    };

    entry.prepaid += payment.amount;
    participantMap.set(normalized, entry);
  }

  const participantArray = Array.from(participantMap.values());
  const attendeeCount = summary.attendees.length;
  const goerCount = summary.attendees.filter((attendee) => attendee.go).length;
  const nonGoerCount = attendeeCount - goerCount;

  const total = courtCost + otherCost;
  const courtSharePerPerson = attendeeCount > 0 ? courtCost / attendeeCount : 0;
  const totalNonGoerCourt = courtSharePerPerson * nonGoerCount;
  const remainingCourt = Math.max(0, courtCost - totalNonGoerCourt);
  const goerShare = goerCount > 0 ? (remainingCourt + otherCost) / goerCount : 0;
  const nonGoerShare = courtSharePerPerson;

  const ownerNormalized = normalizeName(summary.event.owner_name);

  const balances = participantArray.map((participant) => {
    const owes = participant.isAttendee ? (participant.go ? goerShare : nonGoerShare) : 0;

    return {
      name: participant.name,
      prepaid: participant.prepaid,
      balance: participant.prepaid - owes,
      go: participant.go,
      isAttendee: participant.isAttendee,
    };
  });

  balances.sort((a, b) => {
    const aIsOwner = normalizeName(a.name) === ownerNormalized;
    const bIsOwner = normalizeName(b.name) === ownerNormalized;

    if (aIsOwner && !bIsOwner) {
      return -1;
    }

    if (!aIsOwner && bIsOwner) {
      return 1;
    }

    if (a.isAttendee !== b.isAttendee) {
      return a.isAttendee ? -1 : 1;
    }

    return a.name.localeCompare(b.name, 'vi');
  });

  const owner = balances.find((balance) => normalizeName(balance.name) === ownerNormalized);

  return {
    eventLabel: formatEventLabel(summary.event.owner_name, summary.event.sequence),
    total,
    courtCost,
    otherCost,
    share: goerShare,
    goerShare,
    nonGoerShare,
    attendeeCount,
    goerCount,
    nonGoerCount,
    balances,
    owner,
  };
}
