import { describe, expect, it } from 'vitest';

import {
  calculateMacros,
  isLowerBodyLift,
  sessionVolume,
  suggestNextLoad,
  summarizeProgress,
  trendPercent,
} from '@/lib/agents/fitness/logic';
import type { Workout } from '@/lib/db/types';

function workout(partial: Partial<Workout>): Workout {
  return {
    id: 'w',
    date: '2026-01-01',
    exercise: 'Bench Press',
    sets: 4,
    reps: 8,
    weight: 70,
    rpe: 8,
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('suggestNextLoad', () => {
  it('adds a full step on upper body when the set was easy', () => {
    expect(suggestNextLoad(70, 7, false)).toBe(72.5);
  });

  it('adds a bigger step on lower body when the set was easy', () => {
    expect(suggestNextLoad(100, 6, true)).toBe(105);
  });

  it('holds the load at RPE 9', () => {
    expect(suggestNextLoad(100, 9, true)).toBe(100);
  });

  it('deloads to 90% past RPE 9.5', () => {
    expect(suggestNextLoad(100, 10, true)).toBe(90);
  });

  it('makes a half step at RPE 8', () => {
    expect(suggestNextLoad(70, 8, false)).toBe(71.25);
  });

  it('declines to guess without an RPE', () => {
    expect(suggestNextLoad(70, null, false)).toBeNull();
  });
});

describe('isLowerBodyLift', () => {
  it('classifies the common patterns', () => {
    expect(isLowerBodyLift('Back Squat')).toBe(true);
    expect(isLowerBodyLift('Romanian Deadlift')).toBe(true);
    expect(isLowerBodyLift('Bench Press')).toBe(false);
  });
});

describe('summarizeProgress', () => {
  it('reports insufficient data below three sessions', () => {
    const summary = summarizeProgress([workout({ date: '2026-01-01' })], 'Bench Press', 42);
    expect(summary.verdict).toBe('insufficient-data');
    expect(summary.sessions).toBe(1);
  });

  it('aggregates multiple lifts logged on the same date into one session', () => {
    const summary = summarizeProgress(
      [workout({ date: '2026-01-01' }), workout({ date: '2026-01-01', weight: 80 })],
      'Bench Press',
      42,
    );
    expect(summary.sessions).toBe(1);
    expect(summary.points[0].volume).toBe(sessionVolume(workout({})) + 4 * 8 * 80);
    expect(summary.bestWeight).toBe(80);
  });

  it('calls a rising volume curve progressing', () => {
    const summary = summarizeProgress(
      [
        workout({ date: '2026-01-01', weight: 60 }),
        workout({ date: '2026-01-08', weight: 62.5 }),
        workout({ date: '2026-01-15', weight: 70 }),
        workout({ date: '2026-01-22', weight: 75 }),
      ],
      'Bench Press',
      42,
    );
    expect(summary.verdict).toBe('progressing');
    expect(summary.trendPct).toBeGreaterThan(0);
  });

  it('calls a flat curve stalled', () => {
    const summary = summarizeProgress(
      ['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22'].map((date) =>
        workout({ date, weight: 100 }),
      ),
      'Back Squat',
      42,
    );
    expect(summary.verdict).toBe('stalled');
    expect(summary.trendPct).toBe(0);
  });

  it('calls a falling curve regressing', () => {
    const summary = summarizeProgress(
      [
        workout({ date: '2026-01-01', weight: 80 }),
        workout({ date: '2026-01-08', weight: 75 }),
        workout({ date: '2026-01-15', weight: 65 }),
        workout({ date: '2026-01-22', weight: 60 }),
      ],
      'Bench Press',
      42,
    );
    expect(summary.verdict).toBe('regressing');
    expect(summary.trendPct).toBeLessThan(0);
  });

  it('returns an empty, non-throwing summary when nothing is logged', () => {
    const summary = summarizeProgress([], 'Deadlift', 42);
    expect(summary).toMatchObject({ sessions: 0, totalVolume: 0, bestWeight: 0, trendPct: 0 });
  });

  it('orders points chronologically regardless of input order', () => {
    const summary = summarizeProgress(
      [workout({ date: '2026-02-01' }), workout({ date: '2026-01-01' })],
      'Bench Press',
      42,
    );
    expect(summary.points.map((point) => point.date)).toEqual(['2026-01-01', '2026-02-01']);
  });
});

describe('trendPercent', () => {
  it('is zero for a single point', () => {
    expect(trendPercent([{ date: '2026-01-01', volume: 100, topWeight: 100 }])).toBe(0);
  });

  it('does not divide by zero on an empty first window', () => {
    expect(
      trendPercent([
        { date: '2026-01-01', volume: 0, topWeight: 0 },
        { date: '2026-01-02', volume: 100, topWeight: 50 },
      ]),
    ).toBe(0);
  });
});

describe('calculateMacros', () => {
  it('puts a cut below maintenance and a bulk above it', () => {
    const cut = calculateMacros(75, 'moderate', 'cut');
    const maintain = calculateMacros(75, 'moderate', 'maintain');
    const bulk = calculateMacros(75, 'moderate', 'bulk');
    expect(cut.calories).toBeLessThan(maintain.calories);
    expect(bulk.calories).toBeGreaterThan(maintain.calories);
  });

  it('raises protein on a cut', () => {
    expect(calculateMacros(75, 'moderate', 'cut').proteinG).toBeGreaterThan(
      calculateMacros(75, 'moderate', 'maintain').proteinG,
    );
  });

  it('produces macros that add back up to the calorie target', () => {
    const result = calculateMacros(80, 'high', 'maintain');
    const reconstructed = result.proteinG * 4 + result.carbsG * 4 + result.fatG * 9;
    expect(Math.abs(reconstructed - result.calories)).toBeLessThan(12);
  });

  it('never returns negative carbohydrates for a small, heavily cutting athlete', () => {
    expect(calculateMacros(45, 'sedentary', 'cut').carbsG).toBeGreaterThanOrEqual(0);
  });
});
