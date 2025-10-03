import 'dotenv/config';

import { DateTime } from 'luxon';

import { loadConfig } from '../config';
import { destroyDatabase, initDatabase } from '../services/database';
import { createEvent, addAttendee, addPayment } from '../services/eventService';

async function main(): Promise<void> {
  const config = await loadConfig();
  const db = await initDatabase(config);

  try {
    console.log('Seeding demo data...');
    const event = await createEvent(db, {
      groupChatId: 'demo-group',
      groupChatName: 'Cầu lông demo',
      ownerId: 'owner-1',
      ownerName: 'Chủ Kèo',
    });

    await addAttendee(db, { eventId: event.id, name: 'Chủ Kèo' });
    await addAttendee(db, { eventId: event.id, name: 'Trần Minh' });
    await addAttendee(db, { eventId: event.id, name: 'Lê Hải' });

    await db
      .updateTable('events')
      .set({
        event_date: DateTime.now().plus({ days: 3 }).toJSDate(),
        venue_url: 'https://maps.google.com/?q=san+caulong',
      })
      .where('id', '=', event.id)
      .execute();

    await addPayment(db, {
      eventId: event.id,
      payerName: 'Chủ Kèo',
      amount: 300000,
      note: 'Đặt sân',
    });

    await addPayment(db, {
      eventId: event.id,
      payerName: 'Trần Minh',
      amount: 150000,
      note: 'Mua cầu',
    });

    console.log('Seed data inserted.');
  } finally {
    await destroyDatabase(db);
  }
}

void main().catch((error) => {
  console.error('Failed to seed database', error);
  process.exitCode = 1;
});
