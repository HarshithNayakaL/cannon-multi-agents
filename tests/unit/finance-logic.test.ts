import { describe, expect, it } from 'vitest';

import { normalizeCategory, summarizeSpending } from '@/lib/agents/finance/logic';
import { STALE_QUEUE_DAYS, summarizeReading } from '@/lib/agents/learning/logic';
import type { Expense, ReadingItem } from '@/lib/db/types';

function expense(amount: number, category: string, date = '2026-01-10'): Expense {
  return {
    id: `${category}-${amount}`,
    date,
    merchant: 'Test',
    category,
    amount,
    note: null,
    createdAt: `${date}T00:00:00.000Z`,
  };
}

describe('spending summary', () => {
  it('totals, averages and ranks categories by size', () => {
    const result = summarizeSpending(
      [expense(100, 'food'), expense(50, 'transport'), expense(150, 'food')],
      10,
      null,
    );

    expect(result.total).toBe(300);
    expect(result.entries).toBe(3);
    expect(result.dailyAverage).toBe(30);
    expect(result.categories[0]).toEqual({ category: 'food', amount: 250, share: 83.3 });
    expect(result.categories[1].category).toBe('transport');
  });

  it('leaves budget usage null when no budget was stated, rather than assuming one', () => {
    const result = summarizeSpending([expense(100, 'food')], 30, null);
    expect(result.budgetUsedPct).toBeNull();
    expect(result.budget).toBeNull();
  });

  it('reports budget usage over 100 instead of clamping it', () => {
    const result = summarizeSpending([expense(1200, 'food')], 30, 1000);
    expect(result.budgetUsedPct).toBe(120);
  });

  // A window with no spend is a real answer, not an error state.
  it('survives an empty window without dividing by zero', () => {
    const result = summarizeSpending([], 30, 1000);
    expect(result.total).toBe(0);
    expect(result.dailyAverage).toBe(0);
    expect(result.categories).toEqual([]);
    expect(result.budgetUsedPct).toBe(0);
  });

  it('projects a 30-day figure from the daily rate, not from the raw total', () => {
    const result = summarizeSpending([expense(70, 'food')], 7, null);
    expect(result.dailyAverage).toBe(10);
    expect(result.projected).toBe(300);
  });

  it('files anything it does not recognise under other', () => {
    expect(normalizeCategory('FOOD')).toBe('food');
    expect(normalizeCategory(' Transport ')).toBe('transport');
    expect(normalizeCategory('crypto')).toBe('other');
  });
});

function reading(
  id: string,
  status: ReadingItem['status'],
  ageDays: number,
  now: Date,
): ReadingItem {
  const created = new Date(now.getTime() - ageDays * 86_400_000).toISOString();
  return {
    id,
    title: `Item ${id}`,
    kind: 'paper',
    status,
    topic: null,
    takeaway: null,
    createdAt: created,
    updatedAt: created,
  };
}

describe('reading summary', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('counts each status separately', () => {
    const result = summarizeReading(
      [
        reading('a', 'queued', 1, now),
        reading('b', 'reading', 1, now),
        reading('c', 'finished', 1, now),
        reading('d', 'queued', 1, now),
      ],
      'everything',
      now,
    );

    expect(result.counts).toEqual({ queued: 2, reading: 1, finished: 1 });
    expect(result.stale).toEqual([]);
  });

  it('flags queued items past the stale threshold', () => {
    const result = summarizeReading(
      [reading('old', 'queued', STALE_QUEUE_DAYS + 5, now), reading('fresh', 'queued', 2, now)],
      'everything',
      now,
    );

    expect(result.stale).toEqual(['Item old']);
  });

  // Something you are actually reading is not rotting in a queue, however
  // long it has been on the go — a long book is not a stalled one.
  it('never calls an in-progress or finished item stale', () => {
    const result = summarizeReading(
      [reading('reading', 'reading', 400, now), reading('done', 'finished', 400, now)],
      'everything',
      now,
    );

    expect(result.stale).toEqual([]);
  });
});
