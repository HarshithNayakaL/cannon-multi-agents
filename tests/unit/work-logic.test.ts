import { describe, expect, it } from 'vitest';

import { describeFilter, findSlipping, summarizeNotes, truncate } from '@/lib/agents/work/logic';
import type { Note, Task } from '@/lib/db/types';

const NOW = new Date('2026-06-10T12:00:00.000Z');

function task(partial: Partial<Task>): Task {
  return {
    id: 't',
    title: 'A task',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    project: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
    ...partial,
  };
}

describe('findSlipping', () => {
  it('flags anything past its due date', () => {
    expect(findSlipping([task({ title: 'Overdue', dueDate: '2026-06-01' })], NOW)).toEqual([
      'Overdue',
    ]);
  });

  it('ignores a due date in the future', () => {
    expect(findSlipping([task({ title: 'Later', dueDate: '2026-07-01' })], NOW)).toEqual([]);
  });

  it('does not flag a completed task even when it is overdue', () => {
    expect(
      findSlipping([task({ title: 'Shipped late', dueDate: '2026-06-01', status: 'done' })], NOW),
    ).toEqual([]);
  });

  it('flags work parked in blocked past the grace period', () => {
    expect(
      findSlipping(
        [task({ title: 'Stuck', status: 'blocked', updatedAt: '2026-06-01T00:00:00.000Z' })],
        NOW,
      ),
    ).toEqual(['Stuck']);
  });

  it('gives freshly blocked work room to breathe', () => {
    expect(
      findSlipping(
        [task({ title: 'Just blocked', status: 'blocked', updatedAt: '2026-06-10T09:00:00.000Z' })],
        NOW,
      ),
    ).toEqual([]);
  });

  it('does not double-count a task that is both overdue and long-blocked', () => {
    const slipping = findSlipping(
      [
        task({
          title: 'Both',
          status: 'blocked',
          dueDate: '2026-06-01',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }),
      ],
      NOW,
    );
    expect(slipping).toEqual(['Both']);
  });
});

describe('summarizeNotes', () => {
  const notes: Note[] = [
    { id: '1', content: 'Standup note', source: 'standup', date: '2026-06-09' },
    { id: '2', content: 'Retro note', source: 'retro', date: '2026-06-08' },
    { id: '3', content: 'Another standup', source: 'standup', date: '2026-06-07' },
  ];

  it('deduplicates and sorts sources', () => {
    expect(summarizeNotes(notes, 7).sources).toEqual(['retro', 'standup']);
  });

  it('caps excerpts so the model is not handed the whole corpus', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      content: 'note',
      source: 'standup',
      date: '2026-06-09',
    }));
    expect(summarizeNotes(many, 7).excerpts).toHaveLength(6);
  });

  it('reports an honest zero for an empty window', () => {
    expect(summarizeNotes([], 7)).toMatchObject({ noteCount: 0, sources: [], excerpts: [] });
  });
});

describe('helpers', () => {
  it('truncates with an ellipsis only when needed', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('a'.repeat(20), 10)).toHaveLength(10);
    expect(truncate('a'.repeat(20), 10).endsWith('…')).toBe(true);
  });

  it('describes an empty filter in words the agent can repeat', () => {
    expect(describeFilter({})).toBe('all open work');
  });

  it('joins active filters', () => {
    expect(describeFilter({ status: 'blocked', priority: 'high' })).toBe(
      'status=blocked · priority=high',
    );
  });
});
