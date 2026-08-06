import type { CannonStore } from '@/lib/db/types';
import { localEmbedding } from '@/lib/rag/embeddings';

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function daysAhead(days: number): string {
  return daysAgo(-days);
}

const SEED_WORKOUTS = [
  {
    date: daysAgo(1),
    exercise: 'Bench Press',
    sets: 4,
    reps: 8,
    weight: 72.5,
    rpe: 8,
    notes: 'Last set grindy, bar speed dropped.',
  },
  { date: daysAgo(1), exercise: 'Barbell Row', sets: 4, reps: 10, weight: 65, rpe: 7, notes: null },
  {
    date: daysAgo(4),
    exercise: 'Bench Press',
    sets: 4,
    reps: 8,
    weight: 70,
    rpe: 7,
    notes: 'Felt easy, +2.5kg next session.',
  },
  {
    date: daysAgo(4),
    exercise: 'Overhead Press',
    sets: 3,
    reps: 8,
    weight: 45,
    rpe: 8,
    notes: null,
  },
  {
    date: daysAgo(8),
    exercise: 'Back Squat',
    sets: 5,
    reps: 5,
    weight: 100,
    rpe: 9,
    notes: 'Third session stuck at 100kg.',
  },
  {
    date: daysAgo(11),
    exercise: 'Bench Press',
    sets: 4,
    reps: 8,
    weight: 67.5,
    rpe: 7,
    notes: null,
  },
  { date: daysAgo(11), exercise: 'Back Squat', sets: 5, reps: 5, weight: 100, rpe: 8, notes: null },
  {
    date: daysAgo(18),
    exercise: 'Bench Press',
    sets: 4,
    reps: 8,
    weight: 65,
    rpe: 7,
    notes: 'Deload week, kept it light.',
  },
  {
    date: daysAgo(18),
    exercise: 'Back Squat',
    sets: 5,
    reps: 5,
    weight: 97.5,
    rpe: 8,
    notes: null,
  },
  {
    date: daysAgo(25),
    exercise: 'Bench Press',
    sets: 4,
    reps: 8,
    weight: 62.5,
    rpe: 7,
    notes: null,
  },
] as const;

const SEED_TASKS = [
  {
    title: 'Ship Cannon v1 to Vercel',
    status: 'doing',
    priority: 'high',
    dueDate: daysAhead(2),
    project: 'Cannon',
  },
  {
    title: 'Write LinkedIn case study for Cannon',
    status: 'todo',
    priority: 'medium',
    dueDate: daysAhead(6),
    project: 'Content',
  },
  {
    title: 'Finish n8n community node PRD',
    status: 'blocked',
    priority: 'high',
    dueDate: daysAgo(1),
    project: 'n8n',
  },
  {
    title: 'Add retry/fallback library to Cannon',
    status: 'todo',
    priority: 'medium',
    dueDate: daysAhead(9),
    project: 'Infra',
  },
  {
    title: 'Record Maestro walkthrough video',
    status: 'todo',
    priority: 'low',
    dueDate: null,
    project: 'Content',
  },
  {
    title: 'Migrate portfolio site to new domain',
    status: 'done',
    priority: 'medium',
    dueDate: daysAgo(3),
    project: 'Portfolio',
  },
] as const;

const SEED_NOTES = [
  {
    date: daysAgo(2),
    source: 'standup',
    content:
      'Cannon streaming path is working end to end. Tool calls persist through Supabase. Remaining risk is cold-start latency on the first token — worth measuring before the case study goes out.',
  },
  {
    date: daysAgo(5),
    source: 'planning',
    content:
      'n8n community node PRD is blocked on deciding whether the node wraps the whole fallback library or just the retry primitive. Leaning towards the primitive first so the surface stays small.',
  },
  {
    date: daysAgo(9),
    source: 'retro',
    content:
      'Maestro shipped with 28 tests. Cannon should match or beat that number, and the Prompt Inspector is the differentiator worth showing off in the README.',
  },
] as const;

const FITNESS_KNOWLEDGE = [
  'Progressive overload rule of thumb: add 2.5kg to upper-body lifts when the last set finishes at RPE 7 or below, 5kg for lower body.',
  'Stalling on a lift for three consecutive sessions at the same weight is the trigger for a deload to 90% and a rebuild, not for adding volume.',
  'Maintenance intake is roughly 33 kcal per kg of bodyweight for a moderately active lifter; protein target is 1.8g per kg.',
] as const;

const WORK_KNOWLEDGE = [
  'Portfolio pipeline order: Maestro (orchestration), Cannon (domain specialisation), fallback/retry library, n8n community node.',
  'Positioning rule: lead with "AI engineer", never "automation engineer". Maestro is orchestration; Cannon is specialisation. Do not let the two blur.',
  'A task is "slipping" when it is past its due date or has sat in blocked for more than three days.',
] as const;

/**
 * Populates a fresh in-memory store so the public demo has something to
 * reason about on first load. Never runs against Supabase.
 */
export async function seedStore(store: CannonStore): Promise<void> {
  for (const workout of SEED_WORKOUTS) {
    await store.logWorkout({ ...workout });
  }
  for (const task of SEED_TASKS) {
    await store.createTask({ ...task });
  }
  for (const note of SEED_NOTES) {
    await store.addNote({ ...note });
  }

  await store.upsertDocuments([
    ...FITNESS_KNOWLEDGE.map((content) => ({
      agent: 'fitness' as const,
      content,
      embedding: localEmbedding(content),
      metadata: { source: 'training-principles' },
    })),
    ...SEED_WORKOUTS.map((workout) => {
      const content = `${workout.date} — ${workout.exercise} ${workout.sets}x${workout.reps} @ ${workout.weight}kg${
        workout.rpe ? ` (RPE ${workout.rpe})` : ''
      }${workout.notes ? `. ${workout.notes}` : ''}`;
      return {
        agent: 'fitness' as const,
        content,
        embedding: localEmbedding(content),
        metadata: { source: 'workout-log', date: workout.date },
      };
    }),
    ...WORK_KNOWLEDGE.map((content) => ({
      agent: 'work' as const,
      content,
      embedding: localEmbedding(content),
      metadata: { source: 'operating-notes' },
    })),
    ...SEED_NOTES.map((note) => ({
      agent: 'work' as const,
      content: `${note.date} (${note.source}) — ${note.content}`,
      embedding: localEmbedding(note.content),
      metadata: { source: note.source, date: note.date },
    })),
  ]);
}
