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

const SEED_EXPENSES = [
  { date: daysAgo(1), merchant: 'BigBasket', category: 'food', amount: 2840, note: 'Weekly shop.' },
  { date: daysAgo(2), merchant: 'Uber', category: 'transport', amount: 320, note: null },
  {
    date: daysAgo(3),
    merchant: 'Anthropic',
    category: 'subscriptions',
    amount: 1800,
    note: 'Annual plan, billed monthly.',
  },
  { date: daysAgo(4), merchant: 'Blue Tokai', category: 'food', amount: 480, note: null },
  { date: daysAgo(6), merchant: 'Vercel', category: 'subscriptions', amount: 1650, note: null },
  {
    date: daysAgo(7),
    merchant: 'Cult.fit',
    category: 'health',
    amount: 2400,
    note: 'Gym, monthly.',
  },
  { date: daysAgo(9), merchant: 'Uber', category: 'transport', amount: 265, note: null },
  {
    date: daysAgo(12),
    merchant: 'Decathlon',
    category: 'shopping',
    amount: 3200,
    note: 'Lifting shoes.',
  },
  { date: daysAgo(14), merchant: 'Swiggy', category: 'food', amount: 610, note: null },
  { date: daysAgo(15), merchant: 'Supabase', category: 'subscriptions', amount: 2100, note: null },
  { date: daysAgo(19), merchant: 'Landlord', category: 'housing', amount: 24000, note: 'Rent.' },
  { date: daysAgo(22), merchant: 'Apollo Pharmacy', category: 'health', amount: 890, note: null },
  { date: daysAgo(26), merchant: 'BigBasket', category: 'food', amount: 2610, note: null },
] as const;

const SEED_READING = [
  {
    title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
    kind: 'paper',
    status: 'finished',
    topic: 'rag',
    takeaway:
      'Retrieval is part of the model, not a preprocessing step — the generator is trained knowing a retriever exists.',
  },
  {
    title: 'Designing Data-Intensive Applications',
    kind: 'book',
    status: 'reading',
    topic: 'systems',
    takeaway: null,
  },
  {
    title: 'Lost in the Middle: How Language Models Use Long Contexts',
    kind: 'paper',
    status: 'finished',
    topic: 'context',
    takeaway:
      'Accuracy sags for facts buried mid-context. Rank retrieved chunks and keep the strongest ones at the edges.',
  },
  {
    title: 'Matryoshka Representation Learning',
    kind: 'paper',
    status: 'queued',
    topic: 'embeddings',
    takeaway: null,
  },
  {
    title: 'Building Effective Agents',
    kind: 'article',
    status: 'queued',
    topic: 'agents',
    takeaway: null,
  },
  {
    title: 'The Rust Programming Language',
    kind: 'book',
    status: 'queued',
    topic: 'languages',
    takeaway: null,
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

const FINANCE_KNOWLEDGE = [
  'Monthly budget: 45000 total. Rent is fixed at 24000, so 21000 covers everything discretionary.',
  'Subscriptions are reviewed quarterly. Anything unopened for two consecutive months gets cancelled rather than downgraded.',
  'A category is "running hot" when its share of the window exceeds its share of the previous window by more than ten points.',
] as const;

const LEARNING_KNOWLEDGE = [
  'Reading rule: one paper and one book in flight at a time. A third means neither gets finished.',
  'A finished item without a written takeaway does not count as finished — the takeaway is the artefact, the completion is not.',
  'Anything queued for more than thirty days is either promoted to reading this week or dropped. The queue is not an archive.',
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
  for (const expense of SEED_EXPENSES) {
    await store.logExpense({ ...expense });
  }
  for (const item of SEED_READING) {
    await store.addReading({ ...item });
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
    ...FINANCE_KNOWLEDGE.map((content) => ({
      agent: 'finance' as const,
      content,
      embedding: localEmbedding(content),
      metadata: { source: 'budget-rules' },
    })),
    ...SEED_EXPENSES.map((expense) => {
      const content = `${expense.date} — ${expense.merchant} ${expense.amount} (${expense.category})${
        expense.note ? `. ${expense.note}` : ''
      }`;
      return {
        agent: 'finance' as const,
        content,
        embedding: localEmbedding(content),
        metadata: { source: 'expense-log', date: expense.date, category: expense.category },
      };
    }),
    ...LEARNING_KNOWLEDGE.map((content) => ({
      agent: 'learning' as const,
      content,
      embedding: localEmbedding(content),
      metadata: { source: 'study-rules' },
    })),
    ...SEED_READING.map((item) => ({
      agent: 'learning' as const,
      content: `${item.kind}: ${item.title}${item.topic ? ` (${item.topic})` : ''}`,
      embedding: localEmbedding(item.title),
      metadata: { source: 'reading-list', kind: item.kind },
    })),
    // Takeaways are indexed separately from the item they came from. "What
    // have I learned about embeddings" should retrieve the sentence he wrote,
    // not the title of the paper it was written about.
    ...SEED_READING.filter((item) => item.takeaway !== null).map((item) => ({
      agent: 'learning' as const,
      content: `Takeaway from "${item.title}": ${item.takeaway}`,
      embedding: localEmbedding(item.takeaway as string),
      metadata: { source: 'takeaway', title: item.title },
    })),
  ]);
}
