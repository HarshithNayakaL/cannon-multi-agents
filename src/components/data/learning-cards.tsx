import { Quote } from 'lucide-react';

import { Stat, StatGrid } from '@/components/data/stat';
import type {
  ReadingAddedResult,
  ReadingListResult,
  ReadingUpdatedResult,
} from '@/lib/agents/tool-results';
import type { ReadingItem } from '@/lib/db/types';

const STATUS_TONE: Record<ReadingItem['status'], string> = {
  queued: 'var(--ink-3)',
  reading: 'var(--accent)',
  finished: 'var(--good)',
};

function ReadingRow({ item }: { item: ReadingItem }) {
  const finished = item.status === 'finished';

  return (
    <li className="flex items-baseline gap-3 py-2.5">
      <span
        className="dot translate-y-[-1px]"
        style={{ background: STATUS_TONE[item.status] }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-[0.875rem] leading-snug"
          style={{ color: finished ? 'var(--ink-3)' : 'var(--ink)' }}
        >
          {item.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="mono" style={{ color: STATUS_TONE[item.status] }}>
            {item.status}
          </span>
          <span className="mono" style={{ color: 'var(--ink-3)' }} aria-hidden="true">
            ·
          </span>
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {item.kind}
          </span>
          {item.topic ? (
            <>
              <span className="mono" style={{ color: 'var(--ink-3)' }} aria-hidden="true">
                ·
              </span>
              <span className="mono" style={{ color: 'var(--ink-3)' }}>
                {item.topic}
              </span>
            </>
          ) : null}

          {/* The whole id, on the wrapping meta line rather than truncated in
              a fixed column. `finish_reading` takes this value verbatim, and
              the memory store's ids share a prefix — a six-character slice
              read as an identifier while being the same on every row. */}
          <span className="mono" style={{ color: 'var(--ink-3)' }} aria-hidden="true">
            ·
          </span>
          <span className="mono break-all" style={{ color: 'var(--ink-3)' }}>
            {item.id}
          </span>
        </div>

        {/* The takeaway is the artefact this desk exists to produce, so it is
            quoted rather than tucked behind a disclosure. */}
        {item.takeaway ? (
          <p
            className="t-small mt-2 flex gap-2 border-l-2 py-0.5 pl-2.5"
            style={{ borderColor: 'var(--line-strong)' }}
          >
            <Quote className="mt-1 size-3 shrink-0" style={{ color: 'var(--ink-3)' }} />
            <span>{item.takeaway}</span>
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function ReadingListCard({ result }: { result: ReadingListResult }) {
  if (result.items.length === 0) {
    return (
      <p className="t-small">
        Nothing matches <span className="mono">{result.filter}</span>.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="t-subtitle">Queue</h4>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {result.filter}
        </span>
      </div>

      <StatGrid>
        <Stat label="Queued" value={result.counts.queued} />
        <Stat label="Reading" value={result.counts.reading} tone="var(--accent)" />
        <Stat label="Finished" value={result.counts.finished} tone="var(--good)" />
        <Stat
          label="Stale"
          value={result.stale.length}
          tone={result.stale.length > 0 ? 'var(--warn)' : undefined}
        />
      </StatGrid>

      {result.stale.length > 0 ? (
        <p
          className="t-small border-l-2 py-0.5 pl-3"
          style={{ borderColor: 'var(--warn)', color: 'var(--ink-2)' }}
        >
          <span style={{ color: 'var(--warn)' }}>
            {result.stale.length} sitting over a month —{' '}
          </span>
          {result.stale.join(' · ')}
        </p>
      ) : null}

      <ul className="divide-y border-t" style={{ borderColor: 'var(--line)' }}>
        {result.items.map((item) => (
          <ReadingRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

export function ReadingAddedCard({ result }: { result: ReadingAddedResult }) {
  return (
    <div>
      <div className="t-label mb-1">Queued</div>
      <ul>
        <ReadingRow item={result.item} />
      </ul>
    </div>
  );
}

export function ReadingUpdatedCard({ result }: { result: ReadingUpdatedResult }) {
  if (!result.item) {
    return (
      <p className="t-small" style={{ color: 'var(--bad)' }}>
        No reading item with id <span className="mono">{result.requestedId}</span>.
      </p>
    );
  }

  return (
    <div>
      <div className="t-label mb-1">
        {result.item.takeaway ? 'Finished' : 'Finished — no takeaway recorded'}
      </div>
      <ul>
        <ReadingRow item={result.item} />
      </ul>
    </div>
  );
}
