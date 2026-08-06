/**
 * The core telemetry primitive: a quiet label over a loud number.
 *
 * The size jump between the two is the entire hierarchy — no boxes, no rules,
 * no tinted backgrounds. Units sit at label weight so the figure itself is
 * what the eye lands on.
 */
export function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="t-label mb-1 truncate">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="readout text-[1.375rem]" style={{ color: tone ?? 'var(--ink)' }}>
          {value}
        </span>
        {unit ? (
          <span className="text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">{children}</div>;
}
