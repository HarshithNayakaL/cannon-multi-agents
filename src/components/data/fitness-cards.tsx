import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { Sparkline } from '@/components/data/sparkline';
import { Stat, StatGrid } from '@/components/data/stat';
import type {
  MacroResult,
  ProgressSummaryResult,
  WorkoutLoggedResult,
} from '@/lib/agents/tool-results';
import { formatDate } from '@/lib/utils';

export function WorkoutLoggedCard({ result }: { result: WorkoutLoggedResult }) {
  const { workout, nextLoad } = result;
  const volume = workout.sets * workout.reps * workout.weight;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="t-subtitle">{workout.exercise}</h4>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {formatDate(workout.date)}
        </span>
      </div>

      <StatGrid>
        <Stat label="Prescription" value={`${workout.sets}×${workout.reps}`} />
        <Stat label="Load" value={workout.weight} unit="kg" />
        <Stat label="Volume" value={Math.round(volume).toLocaleString()} unit="kg" />
        <Stat label="RPE" value={workout.rpe ?? '—'} tone={rpeTone(workout.rpe)} />
      </StatGrid>

      {workout.rpe !== null ? <RpeMeter rpe={workout.rpe} /> : null}

      <p className="t-small border-t pt-3.5" style={{ borderColor: 'var(--line)' }}>
        {result.note}
        {/* The arrow only earns its place when the note has not already said the number. */}
        {nextLoad !== null &&
        nextLoad !== workout.weight &&
        !result.note.includes(String(nextLoad)) ? (
          <span className="mono ml-1.5" style={{ color: 'var(--accent)' }}>
            → {nextLoad}kg
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Ten discrete ticks rather than a continuous bar: RPE is a ten-point scale a
 * lifter reports, not a measured quantity, and the segmentation says so. Kept
 * narrow and short on purpose — full width it reads as a progress bar, which
 * is exactly the wrong idea.
 */
function RpeMeter({ rpe }: { rpe: number }) {
  return (
    <div className="flex items-end gap-3">
      <div
        className="flex items-end gap-[5px]"
        role="meter"
        aria-valuenow={rpe}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-label="Rate of perceived exertion"
      >
        {Array.from({ length: 10 }, (_, index) => {
          const filled = index < Math.round(rpe);
          return (
            <span
              key={index}
              className="w-[6px] rounded-[3px] transition-colors"
              style={{
                // Ticks rise across the scale, so effort reads as a ramp
                // rather than a progress bar.
                height: `${10 + index * 2}px`,
                background: filled ? rpeTone(rpe) : 'var(--line-strong)',
              }}
            />
          );
        })}
      </div>
      <span className="t-label pb-[1px]">effort</span>
    </div>
  );
}

function rpeTone(rpe: number | null): string {
  if (rpe === null) return 'var(--ink-3)';
  if (rpe >= 9) return 'var(--bad)';
  if (rpe >= 8) return 'var(--warn)';
  return 'var(--good)';
}

const VERDICT_META = {
  progressing: { label: 'Progressing', tone: 'var(--good)', Icon: TrendingUp },
  stalled: { label: 'Stalled', tone: 'var(--warn)', Icon: Minus },
  regressing: { label: 'Regressing', tone: 'var(--bad)', Icon: TrendingDown },
  'insufficient-data': { label: 'Not enough data', tone: 'var(--ink-3)', Icon: Minus },
} as const;

export function ProgressCard({ result }: { result: ProgressSummaryResult }) {
  const verdict = VERDICT_META[result.verdict];

  if (result.sessions === 0) {
    return (
      <p className="t-small">
        No sessions logged for <span className="mono">{result.exercise}</span> in the last{' '}
        {result.rangeDays} days.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="t-subtitle capitalize">{result.exercise}</h4>
        <span className="status" style={{ color: verdict.tone }}>
          <verdict.Icon className="size-3" aria-hidden="true" />
          {verdict.label}
        </span>
      </div>

      <Sparkline
        values={result.points.map((point) => point.volume)}
        labels={result.points.map((point) => point.date)}
      />

      <StatGrid>
        <Stat label="Sessions" value={result.sessions} />
        <Stat label="Total volume" value={result.totalVolume.toLocaleString()} unit="kg" />
        <Stat label="Top load" value={result.bestWeight} unit="kg" />
        <Stat
          label="Volume trend"
          value={`${result.trendPct > 0 ? '+' : ''}${result.trendPct}`}
          unit="%"
          tone={
            result.trendPct > 0
              ? 'var(--good)'
              : result.trendPct < 0
                ? 'var(--bad)'
                : 'var(--ink-2)'
          }
        />
      </StatGrid>

      <p className="t-label">Window: last {result.rangeDays} days</p>
    </div>
  );
}

export function MacroCard({ result }: { result: MacroResult }) {
  const macros = [
    { label: 'Protein', grams: result.proteinG, kcal: result.proteinG * 4, tone: 'var(--good)' },
    { label: 'Carbs', grams: result.carbsG, kcal: result.carbsG * 4, tone: 'var(--accent)' },
    { label: 'Fat', grams: result.fatG, kcal: result.fatG * 9, tone: 'var(--warn)' },
  ];
  const total = macros.reduce((sum, macro) => sum + macro.kcal, 0) || 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="t-label mb-1">Daily target</div>
          <div className="flex items-baseline gap-1">
            <span className="readout text-[2rem] leading-none">
              {result.calories.toLocaleString()}
            </span>
            <span className="text-[0.75rem]" style={{ color: 'var(--ink-3)' }}>
              kcal
            </span>
          </div>
        </div>
        <div className="flex gap-1.5">
          <span className="tag">{result.bodyweightKg}kg</span>
          <span className="tag">{result.activity}</span>
          <span className="tag" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            {result.goal}
          </span>
        </div>
      </div>

      <div className="flex h-1 w-full gap-[2px] overflow-hidden" aria-hidden="true">
        {macros.map((macro) => (
          <div
            key={macro.label}
            className="rounded-full"
            style={{ width: `${(macro.kcal / total) * 100}%`, background: macro.tone }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {macros.map((macro) => (
          <Stat
            key={macro.label}
            label={macro.label}
            value={macro.grams}
            unit="g"
            tone={macro.tone}
          />
        ))}
      </div>
    </div>
  );
}
