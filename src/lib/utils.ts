import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoISO(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "3 days ago" / "in 2 days" relative to today, for due-date badges. */
export function relativeDays(iso: string, from: Date = new Date()): string {
  const target = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return iso;
  const base = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const diff = Math.round((target.getTime() - base) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return diff > 0 ? `in ${diff}d` : `${Math.abs(diff)}d overdue`;
}
