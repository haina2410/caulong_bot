import { DateTime } from 'luxon';

const DIACRITIC_REGEX = /[\u0300-\u036f]/g;

export function normalizeWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function normalizeName(name: string): string {
  const normalized = normalizeWhitespace(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITIC_REGEX, '')
    .replace(/[^a-z0-9\s]/g, '');

  return normalizeWhitespace(normalized);
}

export function slugifyName(name: string): string {
  return normalizeName(name).replace(/\s+/g, '-');
}

export function ceilToThousand(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number');
  }

  if (amount <= 0) {
    return 0;
  }

  return Math.ceil(amount / 1000) * 1000;
}

export function parseAmount(input: string): number {
  const cleaned = input
    .toLowerCase()
    .replace(/[,.]/g, '')
    .replace(/vnd|đ|d|vnđ/g, '')
    .trim();

  const match = cleaned.match(/^(\d+)(k)?$/i);
  if (!match) {
    throw new Error('Invalid amount format');
  }

  const base = Number.parseInt(match[1], 10);
  if (Number.isNaN(base)) {
    throw new Error('Invalid amount number');
  }

  const amount = match[2] ? base * 1000 : base;
  return ceilToThousand(amount);
}

export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} đ`;
}

export function parseCommandDate(input: string): Date {
  const normalized = input.trim();
  const dt = DateTime.fromFormat(normalized, 'dd/LL/yy', { zone: 'Asia/Ho_Chi_Minh' });

  if (!dt.isValid) {
    throw new Error('Invalid date format. Expected dd/mm/yy');
  }

  return dt.startOf('day').toJSDate();
}

export function formatEventLabel(ownerName: string, sequence: number): string {
  return `${ownerName}-${sequence.toString().padStart(3, '0')}`;
}
