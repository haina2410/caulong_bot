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

function normalizeCommandToken(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function getActiveEventOrThrow(
  db: Kysely<Database>,
  threadId: string,
): Promise<Selectable<EventsTable>> {
  const event = await getPlanningEvent(db, threadId);
  if (!event) {
    throw new Error('Hiện không có kèo cầu lông nào đang mở. Dùng "cl tạo" để tạo kèo mới.');
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

  const commandMatch = withoutPrefix.match(/^(\S+)(?:\s+)?([\s\S]*)$/);
  const commandWord = commandMatch?.[1] ?? '';
  const commandArgs = commandMatch?.[2] ?? '';
  const normalizedCommand = normalizeCommandToken(commandWord);
  const normalizedFull = normalizeCommandToken(withoutPrefix);

  if (normalizedCommand === 'tao' || normalizedCommand === 'create') {
    const existing = await getPlanningEvent(ctx.db, ctx.threadId);
    if (existing) {
      const label = formatEventLabel(existing.owner_name, existing.sequence);
      return {
        response: `Đang có kèo ${label} được lên lịch. Dùng "cl summary" để xem tổng quan hoặc "cl kết" để chốt kèo.`,
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
      response: `Đã tạo kèo cầu lông ${label}. Thêm người chơi bằng "cl thêm <tên>".`,
    };
  }

  if (normalizedCommand === 'them' || normalizedCommand === 'add') {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    const name = commandArgs.trim();
    if (!name) {
      throw new Error('Hãy nhập tên người chơi, ví dụ: "cl thêm Hải Nam".');
    }

    await addAttendee(ctx.db, { eventId: event.id, name });
    const label = formatEventLabel(event.owner_name, event.sequence);
    return { response: `Đã thêm ${name} vào kèo ${label}.` };
  }

  if (normalizedCommand === 'date' || normalizedCommand === 'ngay') {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    const dateText = commandArgs.trim();
    if (!dateText) {
      throw new Error('Hãy nhập ngày theo định dạng dd/mm/yy.');
    }

    const date = parseCommandDate(dateText);
    await setEventDate(ctx.db, { eventId: event.id, date });
    const label = formatEventLabel(event.owner_name, event.sequence);
    return { response: `Đã cập nhật ngày cho ${label} thành ${dateText}.` };
  }

  if (normalizedCommand === 'san' || normalizedCommand === 'venue') {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    const venueUrl = commandArgs.trim();
    if (!venueUrl) {
      throw new Error('Hãy nhập đường dẫn sân.');
    }

    await setEventVenue(ctx.db, { eventId: event.id, venueUrl });
    const label = formatEventLabel(event.owner_name, event.sequence);
    return { response: `Đã cập nhật sân cho ${label}: ${venueUrl}.` };
  }

  if (normalizedCommand === 'ket' || normalizedCommand === 'end') {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    await endEvent(ctx.db, event.id);
    const label = formatEventLabel(event.owner_name, event.sequence);
    return {
      response: `Đã đánh dấu ${label} là đã hoàn tất. Dùng "cl summary" để xem tổng kết chi phí.`,
    };
  }

  if ((normalizedCommand === 'summary' || normalizedFull === 'summary') && !commandArgs.trim()) {
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
    lines.push(`### Kèo ${details.eventLabel}`);

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

  const payMatch = withoutPrefix.match(/^(?<name>.+?)\s+(?:pay|trả)\s+(?<rest>.+)$/iu);
  if (payMatch?.groups) {
    const name = payMatch.groups.name.trim();
    const rest = payMatch.groups.rest.trim();
    const [amountToken, ...noteTokens] = rest.split(/\s+/);
    if (!amountToken) {
      throw new Error('Hãy nhập số tiền, ví dụ: "cl Nam trả 200k sân".');
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

  throw new Error('Không nhận diện được lệnh. Thử "cl tạo", "cl thêm <tên>", hoặc "cl summary".');
}
