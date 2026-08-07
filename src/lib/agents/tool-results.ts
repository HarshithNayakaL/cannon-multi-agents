import type { Expense, ReadingItem, Task, Workout } from '@/lib/db/types';

/**
 * Tool outputs are typed and tagged so the chat surface can render a real
 * data card instead of dumping JSON into a message bubble.
 */

export type WorkoutLoggedResult = {
  kind: 'workout-logged';
  workout: Workout;
  /** Suggested next load, derived from RPE. */
  nextLoad: number | null;
  note: string;
};

export type ProgressPoint = { date: string; volume: number; topWeight: number };

export type ProgressSummaryResult = {
  kind: 'progress-summary';
  exercise: string;
  rangeDays: number;
  sessions: number;
  points: ProgressPoint[];
  totalVolume: number;
  bestWeight: number;
  /** Percentage change in per-session volume, first window vs last. */
  trendPct: number;
  verdict: 'progressing' | 'stalled' | 'regressing' | 'insufficient-data';
};

export type MacroResult = {
  kind: 'macros';
  bodyweightKg: number;
  activity: ActivityLevel;
  goal: MacroGoal;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type TaskCreatedResult = { kind: 'task-created'; task: Task };

export type TaskListResult = {
  kind: 'task-list';
  filter: string;
  tasks: Task[];
  slipping: string[];
};

export type TaskUpdatedResult = {
  kind: 'task-updated';
  task: Task | null;
  requestedId: string;
};

export type NotesSummaryResult = {
  kind: 'notes-summary';
  rangeDays: number;
  noteCount: number;
  sources: string[];
  excerpts: { date: string; source: string; content: string }[];
};

export type ExpenseLoggedResult = {
  kind: 'expense-logged';
  expense: Expense;
  monthToDate: number;
};

export type SpendingSummaryResult = {
  kind: 'spending-summary';
  rangeDays: number;
  entries: number;
  total: number;
  dailyAverage: number;
  categories: { category: string; amount: number; share: number }[];
  budget: number | null;
  budgetUsedPct: number | null;
  projected: number;
};

export type ReadingAddedResult = { kind: 'reading-added'; item: ReadingItem };

export type ReadingListResult = {
  kind: 'reading-list';
  filter: string;
  items: ReadingItem[];
  counts: { queued: number; reading: number; finished: number };
  stale: string[];
};

export type ReadingUpdatedResult = {
  kind: 'reading-updated';
  item: ReadingItem | null;
  requestedId: string;
};

export type CannonToolResult =
  | WorkoutLoggedResult
  | ProgressSummaryResult
  | MacroResult
  | TaskCreatedResult
  | TaskListResult
  | TaskUpdatedResult
  | NotesSummaryResult
  | ExpenseLoggedResult
  | SpendingSummaryResult
  | ReadingAddedResult
  | ReadingListResult
  | ReadingUpdatedResult;

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high';
export type MacroGoal = 'cut' | 'maintain' | 'bulk';

export function isCannonToolResult(value: unknown): value is CannonToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    typeof (value as { kind: unknown }).kind === 'string'
  );
}
