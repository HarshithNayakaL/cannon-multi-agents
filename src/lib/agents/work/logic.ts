import type { Note, Task } from '@/lib/db/types';
import type { NotesSummaryResult } from '@/lib/agents/tool-results';

/** Days in `blocked` before the work agent is expected to raise it unprompted. */
export const BLOCKED_GRACE_DAYS = 3;

/**
 * A task is slipping when it is past due, or has been parked in `blocked`
 * long enough that nobody is actually unblocking it.
 */
export function findSlipping(tasks: Task[], now: Date = new Date()): string[] {
  const todayISO = now.toISOString().slice(0, 10);
  const graceCutoff = new Date(now.getTime() - BLOCKED_GRACE_DAYS * 86_400_000).toISOString();

  return tasks
    .filter((task) => {
      if (task.status === 'done') return false;
      if (task.dueDate && task.dueDate < todayISO) return true;
      return task.status === 'blocked' && task.updatedAt < graceCutoff;
    })
    .map((task) => task.title);
}

export function summarizeNotes(notes: Note[], rangeDays: number): NotesSummaryResult {
  const sources = [...new Set(notes.map((note) => note.source))].sort();

  return {
    kind: 'notes-summary',
    rangeDays,
    noteCount: notes.length,
    sources,
    excerpts: notes.slice(0, 6).map((note) => ({
      date: note.date,
      source: note.source,
      content: truncate(note.content, 280),
    })),
  };
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function describeFilter(filter: {
  status?: string;
  priority?: string;
  project?: string;
}): string {
  const parts = [
    filter.status ? `status=${filter.status}` : null,
    filter.priority ? `priority=${filter.priority}` : null,
    filter.project ? `project=${filter.project}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : 'all open work';
}
