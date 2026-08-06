type SparklineProps = {
  values: number[];
  labels?: string[];
  height?: number;
  accent?: string;
};

/**
 * Inline SVG trend line. Deliberately axis-free: this is a glance-level
 * readout inside a chat message, and the exact figures live in the stat row
 * beside it. A single hairline baseline gives the curve something to sit on
 * without importing a whole chart frame.
 *
 * The path is drawn with `preserveAspectRatio="none"` so it stretches to any
 * column width, including ultrawide — which means anything round drawn inside
 * that viewBox would stretch into an ellipse. The latest-value marker is
 * therefore positioned in CSS percentages over the top, where it stays a
 * circle at every width.
 */
export function Sparkline({
  values,
  labels,
  height = 44,
  accent = 'var(--accent)',
}: SparklineProps) {
  if (values.length === 0) return null;

  const width = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;

  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : index * step;
    // 8% padding top and bottom so peaks are never clipped by the stroke.
    const y = 100 - 8 - ((value - min) / span) * 84;
    return { x, y };
  });

  const line = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const last = points[points.length - 1];
  const description = labels
    ? `Trend across ${values.length} sessions from ${labels[0]} to ${labels[labels.length - 1]}`
    : `Trend across ${values.length} points`;

  return (
    <div className="relative" style={{ height }}>
      <svg
        viewBox={`0 0 ${width} 100`}
        preserveAspectRatio="none"
        style={{ height: '100%', width: '100%', display: 'block' }}
        role="img"
        aria-label={description}
      >
        <line
          x1="0"
          y1="99"
          x2={width}
          y2="99"
          stroke="var(--line)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          className="draw"
          points={line}
          fill="none"
          stroke={accent}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-[5px] rounded-full"
        style={{
          left: `${last.x}%`,
          top: `${last.y}%`,
          transform: 'translate(-50%, -50%)',
          background: accent,
        }}
      />
    </div>
  );
}
