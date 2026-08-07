import type { ReadingItem } from '@/lib/db/types';
import type { ReadingListResult } from '@/lib/agents/tool-results';

export const READING_KINDS = ['book', 'paper', 'article', 'course', 'video'] as const;

/** Anything left queued this long has stopped being a plan and become a pile. */
export const STALE_QUEUE_DAYS = 30;

export function summarizeReading(
  items: ReadingItem[],
  filter: string,
  now: Date = new Date(),
): ReadingListResult {
  const staleCutoff = new Date(now.getTime() - STALE_QUEUE_DAYS * 86_400_000).toISOString();

  return {
    kind: 'reading-list',
    filter,
    items,
    counts: {
      queued: items.filter((item) => item.status === 'queued').length,
      reading: items.filter((item) => item.status === 'reading').length,
      finished: items.filter((item) => item.status === 'finished').length,
    },
    // Surfaced unprompted, the same way the work desk surfaces slipping tasks.
    stale: items
      .filter((item) => item.status === 'queued' && item.createdAt < staleCutoff)
      .map((item) => item.title),
  };
}
