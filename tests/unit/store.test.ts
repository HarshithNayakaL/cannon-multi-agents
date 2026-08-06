import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '@/lib/db/memory-store';
import { seedStore } from '@/lib/db/seed';
import { localEmbedding } from '@/lib/rag/embeddings';

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
});

describe('workouts', () => {
  it('returns newest first', async () => {
    await store.logWorkout(base({ date: '2026-01-01' }));
    await store.logWorkout(base({ date: '2026-03-01' }));
    const workouts = await store.listWorkouts();
    expect(workouts.map((workout) => workout.date)).toEqual(['2026-03-01', '2026-01-01']);
  });

  it('matches an exercise filter case-insensitively and partially', async () => {
    await store.logWorkout(base({ exercise: 'Back Squat' }));
    await store.logWorkout(base({ exercise: 'Bench Press' }));
    const squats = await store.listWorkouts({ exercise: 'squat' });
    expect(squats).toHaveLength(1);
    expect(squats[0].exercise).toBe('Back Squat');
  });

  it('applies the since bound inclusively', async () => {
    await store.logWorkout(base({ date: '2026-01-01' }));
    await store.logWorkout(base({ date: '2026-02-01' }));
    expect(await store.listWorkouts({ since: '2026-02-01' })).toHaveLength(1);
  });
});

describe('tasks', () => {
  it('sorts by priority then due date', async () => {
    await store.createTask(taskInput({ title: 'low', priority: 'low', dueDate: '2026-01-01' }));
    await store.createTask(taskInput({ title: 'high', priority: 'high', dueDate: '2026-12-01' }));
    await store.createTask(taskInput({ title: 'medium', priority: 'medium', dueDate: null }));
    const tasks = await store.listTasks();
    expect(tasks.map((task) => task.title)).toEqual(['high', 'medium', 'low']);
  });

  it('filters by status', async () => {
    await store.createTask(taskInput({ title: 'open' }));
    await store.createTask(taskInput({ title: 'stuck', status: 'blocked' }));
    const blocked = await store.listTasks({ status: 'blocked' });
    expect(blocked.map((task) => task.title)).toEqual(['stuck']);
  });

  it('updates a status and stamps updatedAt', async () => {
    const created = await store.createTask(taskInput({ title: 'move me' }));
    const updated = await store.updateTaskStatus(created.id, 'done');
    expect(updated?.status).toBe('done');
    expect(updated?.updatedAt).not.toBe('');
  });

  it('returns null for an unknown id instead of throwing', async () => {
    expect(await store.updateTaskStatus('nope', 'done')).toBeNull();
  });
});

describe('documents', () => {
  it('ranks by similarity and honours the limit', async () => {
    await store.upsertDocuments([
      doc('fitness', 'squat volume is climbing steadily'),
      doc('fitness', 'bench press stalled for three sessions'),
      doc('fitness', 'unrelated note about a holiday'),
    ]);
    const hits = await store.searchDocuments('fitness', localEmbedding('squat volume'), 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].content).toContain('squat');
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
  });

  it('never crosses the agent boundary', async () => {
    await store.upsertDocuments([doc('work', 'squat volume is climbing steadily')]);
    expect(await store.searchDocuments('fitness', localEmbedding('squat volume'), 5)).toEqual([]);
  });

  it('scores a dimension mismatch as zero rather than throwing', async () => {
    await store.upsertDocuments([
      { agent: 'fitness', content: 'stale vector', embedding: [1, 2, 3], metadata: {} },
    ]);
    const hits = await store.searchDocuments('fitness', localEmbedding('anything'), 5);
    expect(hits[0].score).toBe(0);
  });

  it('replaces a document when the same id is upserted twice', async () => {
    await store.upsertDocuments([{ ...doc('work', 'first'), id: 'fixed' }]);
    await store.upsertDocuments([{ ...doc('work', 'second'), id: 'fixed' }]);
    const hits = await store.searchDocuments('work', localEmbedding('second'), 5);
    expect(hits).toHaveLength(1);
    expect(hits[0].content).toBe('second');
  });
});

describe('messages', () => {
  it('keeps transcripts separated per agent', async () => {
    await store.appendMessages([{ agent: 'fitness', role: 'user', parts: [] }]);
    await store.appendMessages([{ agent: 'work', role: 'user', parts: [] }]);
    expect(await store.listMessages('fitness')).toHaveLength(1);
    expect(await store.listMessages('work')).toHaveLength(1);
  });
});

describe('seedStore', () => {
  it('gives the demo something real to reason about on both desks', async () => {
    await seedStore(store);
    expect((await store.listWorkouts()).length).toBeGreaterThan(5);
    expect((await store.listTasks()).length).toBeGreaterThan(3);
    expect(
      (await store.searchDocuments('fitness', localEmbedding('bench press'), 3)).length,
    ).toBeGreaterThan(0);
    expect(
      (await store.searchDocuments('work', localEmbedding('portfolio pipeline'), 3)).length,
    ).toBeGreaterThan(0);
  });
});

function base(partial: Record<string, unknown> = {}) {
  return {
    date: '2026-01-01',
    exercise: 'Bench Press',
    sets: 4,
    reps: 8,
    weight: 70,
    rpe: 8,
    notes: null,
    ...partial,
  } as Parameters<MemoryStore['logWorkout']>[0];
}

function taskInput(partial: Record<string, unknown> = {}) {
  return {
    title: 'Task',
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    project: null,
    ...partial,
  } as Parameters<MemoryStore['createTask']>[0];
}

function doc(agent: 'fitness' | 'work', content: string) {
  return { agent, content, embedding: localEmbedding(content), metadata: { source: 'test' } };
}
