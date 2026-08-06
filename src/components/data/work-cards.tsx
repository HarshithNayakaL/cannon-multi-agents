import { FileText } from 'lucide-react';

import { Stat, StatGrid } from '@/components/data/stat';
import type {
  NotesSummaryResult,
  TaskCreatedResult,
  TaskListResult,
  TaskUpdatedResult,
} from '@/lib/agents/tool-results';
import type { Task } from '@/lib/db/types';
import { formatDate, relativeDays } from '@/lib/utils';

const STATUS_TONE: Record<Task['status'], string> = {
  todo: 'var(--ink-3)',
  doing: 'var(--accent)',
  blocked: 'var(--bad)',
  done: 'var(--good)',
};

const PRIORITY_TONE: Record<Task['priority'], string> = {
  high: 'var(--bad)',
  medium: 'var(--warn)',
  low: 'var(--ink-3)',
};

function TaskRow({ task }: { task: Task }) {
  const overdue =
    task.dueDate !== null &&
    task.status !== 'done' &&
    task.dueDate < new Date().toISOString().slice(0, 10);
  const done = task.status === 'done';

  return (
    <li className="flex items-baseline gap-3 py-2.5">
      <span
        className="dot translate-y-[-1px]"
        style={{ background: STATUS_TONE[task.status] }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p
          className="text-[0.875rem] leading-snug"
          style={{
            color: done ? 'var(--ink-3)' : 'var(--ink)',
            textDecoration: done ? 'line-through' : undefined,
          }}
        >
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="mono" style={{ color: STATUS_TONE[task.status] }}>
            {task.status}
          </span>
          <span className="mono" style={{ color: 'var(--ink-3)' }} aria-hidden="true">
            ·
          </span>
          <span className="mono" style={{ color: PRIORITY_TONE[task.priority] }}>
            {task.priority}
          </span>
          {task.project ? (
            <>
              <span className="mono" style={{ color: 'var(--ink-3)' }} aria-hidden="true">
                ·
              </span>
              <span className="mono" style={{ color: 'var(--ink-3)' }}>
                {task.project}
              </span>
            </>
          ) : null}
        </div>
      </div>
      {task.dueDate ? (
        <span className="mono shrink-0" style={{ color: overdue ? 'var(--bad)' : 'var(--ink-3)' }}>
          {/* A finished task has no deadline left to miss — showing it as
              overdue would be a lie the board keeps telling. */}
          {done ? formatDate(task.dueDate) : relativeDays(task.dueDate)}
        </span>
      ) : null}
    </li>
  );
}

export function TaskListCard({ result }: { result: TaskListResult }) {
  if (result.tasks.length === 0) {
    return (
      <p className="t-small">
        Nothing matches <span className="mono">{result.filter}</span>.
      </p>
    );
  }

  const counts = {
    open: result.tasks.filter((task) => task.status !== 'done').length,
    blocked: result.tasks.filter((task) => task.status === 'blocked').length,
    done: result.tasks.filter((task) => task.status === 'done').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="t-subtitle">Board</h4>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {result.filter}
        </span>
      </div>

      <StatGrid>
        <Stat label="Total" value={result.tasks.length} />
        <Stat label="Open" value={counts.open} />
        <Stat
          label="Blocked"
          value={counts.blocked}
          tone={counts.blocked > 0 ? 'var(--bad)' : undefined}
        />
        <Stat label="Done" value={counts.done} tone="var(--good)" />
      </StatGrid>

      {/* Slipping work gets a left rule rather than a tinted alert box —
          urgent, not alarming, and it does not fight the rest of the card. */}
      {result.slipping.length > 0 ? (
        <p
          className="t-small border-l-2 py-0.5 pl-3"
          style={{ borderColor: 'var(--bad)', color: 'var(--ink-2)' }}
        >
          <span style={{ color: 'var(--bad)' }}>{result.slipping.length} slipping — </span>
          {result.slipping.join(' · ')}
        </p>
      ) : null}

      <ul className="divide-y border-t" style={{ borderColor: 'var(--line)' }}>
        {result.tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </ul>
    </div>
  );
}

export function TaskCreatedCard({ result }: { result: TaskCreatedResult }) {
  return (
    <div>
      <div className="t-label mb-1">Captured</div>
      <ul>
        <TaskRow task={result.task} />
      </ul>
      <div className="mono" style={{ color: 'var(--ink-3)' }}>
        {result.task.id}
      </div>
    </div>
  );
}

export function TaskUpdatedCard({ result }: { result: TaskUpdatedResult }) {
  if (!result.task) {
    return (
      <p className="t-small" style={{ color: 'var(--bad)' }}>
        No task with id <span className="mono">{result.requestedId}</span>.
      </p>
    );
  }
  return (
    <div>
      <div className="t-label mb-1">Updated</div>
      <ul>
        <TaskRow task={result.task} />
      </ul>
    </div>
  );
}

export function NotesSummaryCard({ result }: { result: NotesSummaryResult }) {
  if (result.noteCount === 0) {
    return <p className="t-small">No notes in the last {result.rangeDays} days.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="t-subtitle">
          {result.noteCount} note{result.noteCount === 1 ? '' : 's'}
        </h4>
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {result.sources.join(' · ')} · last {result.rangeDays}d
        </span>
      </div>

      <ul className="divide-y border-t" style={{ borderColor: 'var(--line)' }}>
        {result.excerpts.map((excerpt, index) => (
          <li key={`${excerpt.date}-${index}`} className="py-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <FileText className="size-3" style={{ color: 'var(--ink-3)' }} aria-hidden="true" />
              <span className="mono" style={{ color: 'var(--ink-3)' }}>
                {formatDate(excerpt.date)} · {excerpt.source}
              </span>
            </div>
            <p className="t-small">{excerpt.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
