import type { Expense } from '@/lib/db/types';
import type { SpendingSummaryResult } from '@/lib/agents/tool-results';

/** Buckets the agent is allowed to file spend under. */
export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'housing',
  'health',
  'subscriptions',
  'shopping',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function normalizeCategory(raw: string): ExpenseCategory {
  const lower = raw.trim().toLowerCase();
  return (EXPENSE_CATEGORIES as readonly string[]).includes(lower)
    ? (lower as ExpenseCategory)
    : 'other';
}

/**
 * Pure spend maths. The model narrates these numbers, it does not compute
 * them — same rule as the training figures on the fitness desk.
 */
export function summarizeSpending(
  expenses: Expense[],
  rangeDays: number,
  budget: number | null,
): SpendingSummaryResult {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount);
  }

  const categories = [...byCategory.entries()]
    .map(([category, amount]) => ({
      category,
      amount: round(amount),
      share: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const dailyAverage = rangeDays > 0 ? round(total / rangeDays) : 0;

  return {
    kind: 'spending-summary',
    rangeDays,
    entries: expenses.length,
    total: round(total),
    dailyAverage,
    categories,
    budget,
    // Only meaningful against a stated budget; null means "not being tracked".
    budgetUsedPct: budget && budget > 0 ? Math.round((total / budget) * 1000) / 10 : null,
    projected: round(dailyAverage * 30),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
