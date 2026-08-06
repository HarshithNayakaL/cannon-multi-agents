import type { Workout } from '@/lib/db/types';
import type {
  ActivityLevel,
  MacroGoal,
  MacroResult,
  ProgressPoint,
  ProgressSummaryResult,
} from '@/lib/agents/tool-results';

/**
 * Pure training maths. Kept out of the tool wrappers so the numbers the
 * coach quotes are unit-tested rather than trusted to a model.
 */

/** Progressive overload increment, keyed on how hard the last set actually was. */
export function suggestNextLoad(
  weight: number,
  rpe: number | null,
  isLowerBody: boolean,
): number | null {
  if (rpe === null) return null;
  if (rpe >= 9.5) return round(weight * 0.9);
  if (rpe >= 9) return weight;
  if (rpe <= 7) return round(weight + (isLowerBody ? 5 : 2.5));
  return round(weight + (isLowerBody ? 2.5 : 1.25));
}

const LOWER_BODY_PATTERNS = ['squat', 'deadlift', 'lunge', 'leg', 'hip thrust', 'calf'];

export function isLowerBodyLift(exercise: string): boolean {
  const normalized = exercise.toLowerCase();
  return LOWER_BODY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function round(value: number): number {
  return Math.round(value * 4) / 4;
}

export function sessionVolume(workout: Workout): number {
  return workout.sets * workout.reps * workout.weight;
}

export function summarizeProgress(
  workouts: Workout[],
  exercise: string,
  rangeDays: number,
): ProgressSummaryResult {
  const byDate = new Map<string, ProgressPoint>();

  for (const workout of workouts) {
    const point = byDate.get(workout.date) ?? { date: workout.date, volume: 0, topWeight: 0 };
    point.volume += sessionVolume(workout);
    point.topWeight = Math.max(point.topWeight, workout.weight);
    byDate.set(workout.date, point);
  }

  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totalVolume = points.reduce((sum, point) => sum + point.volume, 0);
  const bestWeight = points.reduce((max, point) => Math.max(max, point.topWeight), 0);

  return {
    kind: 'progress-summary',
    exercise,
    rangeDays,
    sessions: points.length,
    points,
    totalVolume: Math.round(totalVolume),
    bestWeight,
    trendPct: trendPercent(points),
    verdict: verdictFor(points),
  };
}

/** First half vs second half of the window — robust to a single outlier session. */
export function trendPercent(points: ProgressPoint[]): number {
  if (points.length < 2) return 0;
  const split = Math.floor(points.length / 2);
  const early = points.slice(0, split);
  const late = points.slice(points.length - split);
  const earlyMean = mean(early.map((point) => point.volume));
  const lateMean = mean(late.map((point) => point.volume));
  if (earlyMean === 0) return 0;
  return Math.round(((lateMean - earlyMean) / earlyMean) * 1000) / 10;
}

function verdictFor(points: ProgressPoint[]): ProgressSummaryResult['verdict'] {
  if (points.length < 3) return 'insufficient-data';
  const trend = trendPercent(points);
  if (trend > 3) return 'progressing';
  if (trend < -3) return 'regressing';
  return 'stalled';
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 28,
  light: 31,
  moderate: 34,
  high: 38,
};

const GOAL_DELTA: Record<MacroGoal, number> = {
  cut: -400,
  maintain: 0,
  bulk: 300,
};

/**
 * kcal/kg heuristic rather than Mifflin-St Jeor: it needs only bodyweight,
 * which is the one input reliably present in the log.
 */
export function calculateMacros(
  bodyweightKg: number,
  activity: ActivityLevel,
  goal: MacroGoal,
): MacroResult {
  const calories = Math.round(bodyweightKg * ACTIVITY_MULTIPLIER[activity] + GOAL_DELTA[goal]);
  const proteinG = Math.round(bodyweightKg * (goal === 'cut' ? 2.2 : 1.8));
  const fatG = Math.round((calories * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return {
    kind: 'macros',
    bodyweightKg,
    activity,
    goal,
    calories,
    proteinG,
    carbsG,
    fatG,
  };
}
