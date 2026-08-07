/**
 * The core telemetry primitive: a quiet label over a loud number, sitting on
 * its own tile.
 *
 * The size jump between label and figure is the entire hierarchy — no rules,
 * no chrome. Units sit at label weight so the figure is what the eye lands on.
 * `wide` promotes a tile to the full row when its number is the headline
 * rather than one of a set.
 */
export function Stat({
  label,
  value,
  unit,
  tone,
  wide = false,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: string;
  wide?: boolean;
}) {
  return (
    <div className={`tile${wide ? ' bento-wide' : ''}`}>
      <div className="t-label mb-1 truncate">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={`readout ${wide ? 'text-[1.75rem]' : 'text-[1.375rem]'} leading-none`}
          style={{ color: tone ?? 'var(--ink)' }}
        >
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
  return <div className="bento">{children}</div>;
}
