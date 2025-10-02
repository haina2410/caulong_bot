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
  ensureGroupChat,
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
    throw new Error('Nội dung lệnh đang trống.');
  }

  return body.trim();
}

async function getActiveEventOrThrow(
  db: Kysely<Database>,
  threadId: string,
): Promise<Selectable<EventsTable>> {
  const event = await getPlanningEvent(db, threadId);
  if (!event) {
    throw new Error('Hiện không có kèo cầu lông nào đang mở. Dùng "cl create" để tạo kèo mới.');
  }

  return event;
}

export async function handleCommand(ctx: CommandContext): Promise<CommandResult> {
  await ensureGroupChat(ctx.db, { id: ctx.threadId, name: ctx.threadName ?? null });

  const raw = requireBody(ctx.body);
  const withoutPrefix = raw.slice(2).trim();
  if (!withoutPrefix) {
    throw new Error('Thiếu tên lệnh. Thử "cl help".');
  }

  const lower = withoutPrefix.toLowerCase();

  if (lower === 'create') {
    const existing = await getPlanningEvent(ctx.db, ctx.threadId);
    if (existing) {
      const label = formatEventLabel(existing.owner_name, existing.sequence);
      return {
        response: `Đang có kèo ${label} được lên lịch. Dùng "cl summary" để xem tổng quan hoặc "cl end" để chốt kèo.`,
      };
    }

    const event = await createEvent(ctx.db, {
      groupChatId: ctx.threadId,
      groupChatName: ctx.threadName ?? null,
      ownerId: ctx.senderId,
      ownerName: ctx.senderName,
    });

    const label = formatEventLabel(event.owner_name, event.sequence);
    return {
      response: `Đã tạo kèo cầu lông ${label}. Thêm người chơi bằng "cl add <tên>".`,
    };
  }

  if (lower.startsWith('add ')) {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    const name = withoutPrefix.slice(4).trim();
    if (!name) {
      throw new Error('Hãy nhập tên người chơi, ví dụ: "cl add Hải Nam".');
    }

    await addAttendee(ctx.db, { eventId: event.id, name });
    const label = formatEventLabel(event.owner_name, event.sequence);
    return { response: `Đã thêm ${name} vào kèo ${label}.` };
  }

  if (lower.startsWith('date ')) {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    const dateText = withoutPrefix.slice(5).trim();
    if (!dateText) {
      throw new Error('Hãy nhập ngày theo định dạng dd/mm/yy.');
    }

    const date = parseCommandDate(dateText);
    await setEventDate(ctx.db, { eventId: event.id, date });
    const label = formatEventLabel(event.owner_name, event.sequence);
    return { response: `Đã cập nhật ngày cho ${label} thành ${dateText}.` };
  }

  if (lower.startsWith('venue ')) {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    const venueUrl = withoutPrefix.slice(6).trim();
    if (!venueUrl) {
      throw new Error('Hãy nhập đường dẫn sân.');
    }

    await setEventVenue(ctx.db, { eventId: event.id, venueUrl });
    const label = formatEventLabel(event.owner_name, event.sequence);
    return { response: `Đã cập nhật sân cho ${label}: ${venueUrl}.` };
  }

  if (lower === 'end') {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    await endEvent(ctx.db, event.id);
    const label = formatEventLabel(event.owner_name, event.sequence);
    return {
      response: `Đã đánh dấu ${label} là đã hoàn tất. Dùng "cl summary" để xem tổng kết chi phí.`,
    };
  }

  if (lower === 'summary') {
    const event = await getLatestEvent(ctx.db, ctx.threadId);
    if (!event) {
      return { response: 'Chưa có kèo cầu lông nào trong nhóm này.' };
    }

    const summary = await getEventSummary(ctx.db, event.id);
    if (!summary) {
      return { response: 'Không tìm thấy chi tiết cho kèo gần nhất.' };
    }

    const details = summarizeEvent(summary);
    const lines: string[] = [];
    lines.push(`Kèo ${details.eventLabel}`);
    lines.push(`Trạng thái: ${event.status}`);

    if (event.event_date) {
      lines.push(`Ngày: ${event.event_date.toLocaleDateString('vi-VN')}`);
    }

    if (event.venue_url) {
      lines.push(`Sân: ${event.venue_url}`);
    }

    lines.push(`Tổng chi phí: ${formatCurrency(details.total)}`);
    lines.push(`Mỗi người: ${formatCurrency(details.share)}`);

    if (summary.payments.length) {
      lines.push('Chi tiết chi phí:');
      for (const payment of summary.payments) {
        const note = payment.note ? ` (${payment.note})` : '';
        lines.push(`- ${payment.payer_name}: ${formatCurrency(payment.amount)}${note}`);
      }
    }

    if (summary.attendees.length) {
      lines.push(
        `Thành viên (${summary.attendees.length}): ${summary.attendees
          .map((attendee) => attendee.name)
          .join(', ')}`,
      );
    }

    lines.push('Tổng kết:');
    details.balances.forEach((balance, index) => {
      const rank = index + 1;
      const formatted = formatCurrency(Math.abs(balance.balance));
      const sign = balance.balance >= 0 ? '' : '-';
      const ownerTag =
        normalizeName(balance.name) === normalizeName(event.owner_name) ? ' (chủ kèo)' : '';
      lines.push(`${rank}. ${balance.name}${ownerTag} ${sign}${formatted}`);
    });

    return { response: lines.join('\n') };
  }

  const payMatch = withoutPrefix.match(/^(?<name>.+?)\s+pay\s+(?<rest>.+)$/i);
  if (payMatch?.groups) {
    const name = payMatch.groups.name.trim();
    const rest = payMatch.groups.rest.trim();
    const [amountToken, ...noteTokens] = rest.split(/\s+/);
    if (!amountToken) {
      throw new Error('Hãy nhập số tiền, ví dụ: "cl Nam pay 200k sân".');
    }

    const amount = parseAmount(amountToken);
    const note = noteTokens.join(' ').trim() || undefined;
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);

    await addAttendee(ctx.db, { eventId: event.id, name });
    await addPayment(ctx.db, { eventId: event.id, payerName: name, amount, note });

    const label = formatEventLabel(event.owner_name, event.sequence);
    return {
      response: `${name} đã ứng ${formatCurrency(amount)} cho ${label}${note ? ` (${note})` : ''}.`,
    };
  }

  throw new Error('Không nhận diện được lệnh. Thử "cl create", "cl add <tên>", hoặc "cl summary".');
}
