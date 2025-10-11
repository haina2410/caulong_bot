import type { Kysely, Selectable } from 'kysely';

import type { Database, EventsTable } from '../services/database';
import {
  addAttendee,
  addPayment,
  createEvent,
  endEvent,
  ensureGroupChat,
  getLatestEvent,
  getPlanningEvent,
  getEventSummary,
  removeAttendee,
  setEventDate,
  setEventVenue,
  setAttendeeGo,
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
    throw new Error('Thiếu tên lệnh. Thử "cl giúp".');
  }

  const commandMatch = withoutPrefix.match(/^(\S+)(?:\s+)?([\s\S]*)$/);
  const commandWord = commandMatch?.[1] ?? '';
  const commandArgs = commandMatch?.[2] ?? '';
  const normalizedCommand = normalizeCommandToken(commandWord);

  if (normalizedCommand === 'help' || normalizedCommand === 'giup') {
    const lines = [
      'Hướng dẫn lệnh cầu lông:',
      '- cl tạo: tạo kèo mới.',
      '- cl thêm <tên1, tên2>: thêm một hoặc nhiều người chơi.',
      '- cl <tên> trả <số tiền> [ghi chú]: ghi nhận chi phí.',
      '- cl ngày <dd/mm/yy>: đặt ngày chơi.',
      '- cl sân <tên, link>: cập nhật tên, link sân.',
      '- cl kết: chốt kèo hiện tại.',
      '- cl đá <tên>: xoá người ra khỏi kèo.',
      '- cl tiền: xem tổng kết kèo gần nhất.',
      '- cl giúp / cl help: hiển thị danh sách lệnh.',
    ];

    return { response: lines.join('\n') };
  }

  if (normalizedCommand === 'tao' || normalizedCommand === 'create') {
    const existing = await getPlanningEvent(ctx.db, ctx.threadId);
    if (existing) {
      const label = formatEventLabel(existing.owner_name, existing.sequence);
      return {
        response: `Đang có kèo ${label} được lên lịch. Dùng "cl tiền" để xem tổng quan hoặc "cl kết" để chốt kèo.`,
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
    const rawNames = commandArgs
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (!rawNames.length) {
      throw new Error('Hãy nhập tên người chơi, ví dụ: "cl thêm Hải Nam" hoặc "cl thêm Nam, Huy".');
    }

    for (const name of rawNames) {
      await addAttendee(ctx.db, { eventId: event.id, name });
    }

    const label = formatEventLabel(event.owner_name, event.sequence);
    const uniqueNames = Array.from(new Set(rawNames));
    const list = uniqueNames.join(', ');
    return {
      response: `Đã thêm ${list} vào kèo ${label}.`,
    };
  }

  const notGoingMatch = withoutPrefix.match(/^(?<name>.+?)\s+(khong di|không đi)$/iu);
  if (notGoingMatch?.groups) {
    const name = notGoingMatch.groups.name.trim();
    if (!name) {
      throw new Error('Hãy nhập tên người chơi, ví dụ: "cl Nam không đi".');
    }

    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    const updated = await setAttendeeGo(ctx.db, { eventId: event.id, name, go: false });

    if (!updated) {
      throw new Error(`Không thấy ${name} trong kèo hiện tại.`);
    }

    const label = formatEventLabel(event.owner_name, event.sequence);
    return {
      response: `Đã đánh dấu ${name} không đi kèo ${label}.`,
    };
  }

  if (normalizedCommand === 'da' || normalizedCommand === 'remove') {
    const event = await getActiveEventOrThrow(ctx.db, ctx.threadId);
    const rawNames = commandArgs
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (!rawNames.length) {
      throw new Error('Hãy nhập tên cần đá, ví dụ: "cl đá Nam".');
    }

    const ownerNormalized = normalizeName(event.owner_name);
    const removed: string[] = [];
    const missing: string[] = [];
    const protectedNames: string[] = [];

    for (const name of rawNames) {
      if (normalizeName(name) === ownerNormalized) {
        protectedNames.push(name);
        continue;
      }

      const deleted = await removeAttendee(ctx.db, { eventId: event.id, name });
      if (deleted) {
        removed.push(name);
      } else {
        missing.push(name);
      }
    }

    if (!removed.length) {
      if (protectedNames.length) {
        throw new Error('Không thể đá chủ kèo khỏi danh sách.');
      }

      const target = missing.length === 1 ? missing[0] : 'các tên đã nhập';
      throw new Error(`Không tìm thấy ${target} trong kèo hiện tại.`);
    }

    const label = formatEventLabel(event.owner_name, event.sequence);
    const removedList = Array.from(new Set(removed)).join(', ');
    const fragments = [`Đã đá ${removedList} khỏi kèo ${label}.`];

    if (missing.length) {
      const missingList = Array.from(new Set(missing)).join(', ');
      fragments.push(`Không thấy ${missingList} trong danh sách.`);
    }

    if (protectedNames.length) {
      const protectedList = Array.from(new Set(protectedNames)).join(', ');
      fragments.push(`Không thể đá chủ kèo ${protectedList}.`);
    }

    return { response: fragments.join(' ') };
  }

  if (normalizedCommand === 'ngay' || normalizedCommand === 'date') {
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
      response: `Đã đánh dấu ${label} là đã hoàn tất. Dùng "cl tiền" để xem tổng kết chi phí.`,
    };
  }

  const summaryTokens = new Set(['summary', 'tien']);
  if (summaryTokens.has(normalizedCommand) && !commandArgs.trim()) {
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
    lines.push(
      `Tiền sân: ${formatCurrency(details.courtCost)} | Chi khác: ${formatCurrency(details.otherCost)}`,
    );
    lines.push(`Người đi/đăng ký: ${details.goerCount}/${details.attendeeCount}`);
    lines.push(`Mỗi người đi: ${formatCurrency(Math.round(details.goerShare))}`);
    if (details.nonGoerCount > 0) {
      lines.push(`Mỗi người không đi: ${formatCurrency(Math.round(details.nonGoerShare))}`);
    }

    if (summary.payments.length) {
      lines.push('Chi tiết chi phí:');
      for (const payment of summary.payments) {
        const note = payment.note ? ` (${payment.note})` : '';
        lines.push(`- ${payment.payer_name}: ${formatCurrency(payment.amount)}${note}`);
      }
    }

    if (summary.attendees.length) {
      const attendeeList = summary.attendees
        .map((attendee) => (attendee.go ? attendee.name : `${attendee.name} (không đi)`))
        .join(', ');
      lines.push(`Thành viên (${summary.attendees.length}): ${attendeeList}`);
    }

    lines.push('Tổng kết:');
    details.balances.forEach((balance, index) => {
      const rank = index + 1;
      const amount = Math.round(Math.abs(balance.balance));
      const formatted = formatCurrency(amount);
      const sign = balance.balance >= 0 ? '' : '-';
      const ownerTag =
        normalizeName(balance.name) === normalizeName(event.owner_name) ? ' (chủ kèo)' : '';
      const statusTag = balance.isAttendee ? (balance.go ? '' : ' (không đi)') : ' (ngoài DS)';
      lines.push(`${rank}. ${balance.name}${ownerTag}${statusTag} ${sign}${formatted}`);
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

  throw new Error(
    'Không nhận diện được lệnh. Thử "cl tạo", "cl thêm <tên>", "cl tiền" hoặc "cl giúp".',
  );
}
