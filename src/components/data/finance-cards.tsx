import { Stat, StatGrid } from '@/components/data/stat';
import type { ExpenseLoggedResult, SpendingSummaryResult } from '@/lib/agents/tool-results';
import { formatDate } from '@/lib/utils';

/**
 * Money is formatted, never raw. `toLocaleString` with two fraction digits
 * keeps a column of amounts aligned under `.readout`'s tabular figures, which
 * a bare `toFixed` on an integer amount would break.
 */
function money(amount: number): string {
  // Two digits or none, never one. Left to `maximumFractionDigits` alone,
  // 43164.9 renders as "43,164.9" beside "1,438.83" and the decimal points
  // stop lining up in a column of tabular figures.
  const fractional = amount % 1 !== 0;
  return amount.toLocaleString('en-IN', {
    minimumFractionDigits: fractional ? 2 : 0,
    maximumFractionDigits: fractional ? 2 : 0,
  });
}

export function ExpenseLoggedCard({ result }: { result: ExpenseLoggedResult }) {
  const { expense } = result;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="t-subtitle min-w-0 truncate">{expense.merchant}</h4>
        <span className="readout text-[1.5rem] leading-none">{money(expense.amount)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tag">{expense.category}</span>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {formatDate(expense.date)}
        </span>
      </div>

      {expense.note ? <p className="t-small">{expense.note}</p> : null}

      {/* The single number worth seeing at the moment of capture: what this
          spend just did to the running month. */}
      <StatGrid>
        <Stat label="Last 30 days" value={money(result.monthToDate)} wide />
      </StatGrid>
    </div>
  );
}

export function SpendingSummaryCard({ result }: { result: SpendingSummaryResult }) {
  if (result.entries === 0) {
    return <p className="t-small">Nothing logged in the last {result.rangeDays} days.</p>;
  }

  // Over budget is the one condition worth colouring. Under budget is simply
  // the expected state and does not need to be congratulated.
  const overBudget = result.budgetUsedPct !== null && result.budgetUsedPct > 100;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="t-subtitle">Spending</h4>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {result.entries} entries · last {result.rangeDays}d
        </span>
      </div>

      <StatGrid>
        <Stat label="Total" value={money(result.total)} />
        <Stat label="Per day" value={money(result.dailyAverage)} />
        <Stat label="Projected 30d" value={money(result.projected)} />
        {result.budgetUsedPct !== null ? (
          <Stat
            label="Of budget"
            value={result.budgetUsedPct}
            unit="%"
            tone={overBudget ? 'var(--bad)' : 'var(--good)'}
          />
        ) : (
          <Stat label="Budget" value="—" />
        )}
      </StatGrid>

      {overBudget ? (
        <p
          className="t-small border-l-2 py-0.5 pl-3"
          style={{ borderColor: 'var(--bad)', color: 'var(--ink-2)' }}
        >
          <span style={{ color: 'var(--bad)' }}>
            {money(result.total - (result.budget ?? 0))} over{' '}
          </span>
          the {money(result.budget ?? 0)} budget for this window.
        </p>
      ) : null}

      {/* A bar per category rather than a pie: shares are being compared to
          each other, and a length is easier to compare than an angle. */}
      <ul className="space-y-2.5">
        {result.categories.map((entry) => (
          <li key={entry.category}>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="t-small flex-1 truncate" style={{ color: 'var(--ink)' }}>
                {entry.category}
              </span>
              <span className="mono" style={{ color: 'var(--ink-2)' }}>
                {money(entry.amount)}
              </span>
              <span className="mono w-11 text-right" style={{ color: 'var(--ink-3)' }}>
                {entry.share}%
              </span>
            </div>
            <div
              className="h-[3px] w-full overflow-hidden rounded-[var(--r-pill)]"
              style={{ background: 'var(--line)' }}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-[var(--r-pill)]"
                style={{
                  width: `${Math.max(2, entry.share)}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
