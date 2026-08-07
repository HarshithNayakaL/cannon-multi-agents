import { Tag } from 'lucide-react';

import { Stat, StatGrid } from '@/components/data/stat';
import type { RecordAddedResult, RecordListResult } from '@/lib/agents/tool-results';
import type { AgentRecord } from '@/lib/db/types';
import { formatDate } from '@/lib/utils';

function RecordRow({ record }: { record: AgentRecord }) {
  return (
    <li className="py-3">
      <div className="mb-1 flex items-baseline gap-2">
        <p className="flex-1 text-[0.875rem] leading-snug" style={{ color: 'var(--ink)' }}>
          {record.title}
        </p>
        <span className="mono shrink-0" style={{ color: 'var(--ink-3)' }}>
          {formatDate(record.createdAt)}
        </span>
      </div>

      <p className="t-small whitespace-pre-wrap">{record.body}</p>

      {record.tags.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {record.tags.map((tag) => (
            <span key={tag} className="mono" style={{ color: 'var(--accent)' }}>
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function RecordAddedCard({ result }: { result: RecordAddedResult }) {
  return (
    <div>
      <div className="t-label mb-1">Recorded</div>
      <ul>
        <RecordRow record={result.record} />
      </ul>
    </div>
  );
}

export function RecordListCard({ result }: { result: RecordListResult }) {
  if (result.records.length === 0) {
    return (
      <p className="t-small">
        Nothing recorded for <span className="mono">{result.filter}</span> yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="t-subtitle">Records</h4>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {result.filter}
        </span>
      </div>

      {/* A created agent has no domain maths to summarise, so the readout is
          what it does have: how much is here and how it is grouped. */}
      <StatGrid>
        <Stat label="Entries" value={result.records.length} />
        <Stat label="Tags" value={result.tags.length} />
        {result.tags.slice(0, 2).map((entry) => (
          <Stat key={entry.tag} label={entry.tag} value={entry.count} tone="var(--accent)" />
        ))}
      </StatGrid>

      {result.tags.length > 2 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Tag className="size-3" style={{ color: 'var(--ink-3)' }} aria-hidden="true" />
          {result.tags.map((entry) => (
            <span key={entry.tag} className="mono" style={{ color: 'var(--ink-3)' }}>
              {entry.tag} · {entry.count}
            </span>
          ))}
        </div>
      ) : null}

      <ul className="divide-y border-t" style={{ borderColor: 'var(--line)' }}>
        {result.records.map((record) => (
          <RecordRow key={record.id} record={record} />
        ))}
      </ul>
    </div>
  );
}
