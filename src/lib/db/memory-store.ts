import { cosineSimilarity } from 'ai';

import type { AgentId } from '@/lib/agents/types';
import type {
  CannonStore,
  Expense,
  ExpenseFilter,
  ExpenseInput,
  Note,
  ReadingFilter,
  ReadingInput,
  ReadingItem,
  ReadingStatus,
  ScoredDocument,
  StoredMessage,
  Task,
  TaskFilter,
  TaskInput,
  TaskStatus,
  VectorDocument,
  VectorDocumentInput,
  Workout,
  WorkoutFilter,
  WorkoutInput,
} from '@/lib/db/types';

let counter = 0;

function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

type Tables = {
  workouts: Workout[];
  tasks: Task[];
  notes: Note[];
  expenses: Expense[];
  reading: ReadingItem[];
  documents: VectorDocument[];
  messages: StoredMessage[];
};

/**
 * Process-local store used whenever Supabase is not configured.
 *
 * On Vercel this means data lives for the lifetime of a warm lambda — good
 * enough for the public demo, explicitly not the production path. Unit tests
 * construct their own instance so state never leaks between cases.
 */
export class MemoryStore implements CannonStore {
  readonly kind = 'memory' as const;

  private readonly tables: Tables = {
    workouts: [],
    tasks: [],
    notes: [],
    expenses: [],
    reading: [],
    documents: [],
    messages: [],
  };

  async logWorkout(input: WorkoutInput): Promise<Workout> {
    const workout: Workout = { ...input, id: id('wk'), createdAt: new Date().toISOString() };
    this.tables.workouts.push(workout);
    return workout;
  }

  async listWorkouts(filter: WorkoutFilter = {}): Promise<Workout[]> {
    return this.tables.workouts
      .filter((workout) => {
        if (filter.exercise && !matchesExercise(workout.exercise, filter.exercise)) return false;
        if (filter.since && workout.date < filter.since) return false;
        return true;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  async createTask(input: TaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = { ...input, id: id('tk'), createdAt: now, updatedAt: now };
    this.tables.tasks.push(task);
    return task;
  }

  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    const priorityRank: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 };
    return this.tables.tasks
      .filter((task) => {
        if (filter.status && task.status !== filter.status) return false;
        if (filter.priority && task.priority !== filter.priority) return false;
        if (filter.project && task.project !== filter.project) return false;
        return true;
      })
      .sort((a, b) => {
        const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
        if (byPriority !== 0) return byPriority;
        return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31');
      });
  }

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task | null> {
    const task = this.tables.tasks.find((candidate) => candidate.id === taskId);
    if (!task) return null;
    task.status = status;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  async addNote(input: Omit<Note, 'id'>): Promise<Note> {
    const note: Note = { ...input, id: id('nt') };
    this.tables.notes.push(note);
    return note;
  }

  async listNotes(since?: string): Promise<Note[]> {
    return this.tables.notes
      .filter((note) => (since ? note.date >= since : true))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async logExpense(input: ExpenseInput): Promise<Expense> {
    const expense: Expense = { ...input, id: id('ex'), createdAt: new Date().toISOString() };
    this.tables.expenses.push(expense);
    return expense;
  }

  async listExpenses(filter: ExpenseFilter = {}): Promise<Expense[]> {
    return this.tables.expenses
      .filter((expense) => {
        if (filter.category && expense.category.toLowerCase() !== filter.category.toLowerCase()) {
          return false;
        }
        if (filter.since && expense.date < filter.since) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async addReading(input: ReadingInput): Promise<ReadingItem> {
    const now = new Date().toISOString();
    const item: ReadingItem = { ...input, id: id('rd'), createdAt: now, updatedAt: now };
    this.tables.reading.push(item);
    return item;
  }

  async listReading(filter: ReadingFilter = {}): Promise<ReadingItem[]> {
    const rank: Record<ReadingStatus, number> = { reading: 0, queued: 1, finished: 2 };
    return this.tables.reading
      .filter((item) => {
        if (filter.status && item.status !== filter.status) return false;
        if (filter.topic && item.topic !== filter.topic) return false;
        return true;
      })
      .sort((a, b) => rank[a.status] - rank[b.status]);
  }

  async updateReadingStatus(
    itemId: string,
    status: ReadingStatus,
    takeaway?: string | null,
  ): Promise<ReadingItem | null> {
    const item = this.tables.reading.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    item.status = status;
    if (takeaway !== undefined) item.takeaway = takeaway;
    item.updatedAt = new Date().toISOString();
    return item;
  }

  async upsertDocuments(documents: VectorDocumentInput[]): Promise<number> {
    for (const input of documents) {
      const existingIndex = input.id
        ? this.tables.documents.findIndex((doc) => doc.id === input.id)
        : -1;
      const record: VectorDocument = {
        id: input.id ?? id('doc'),
        agent: input.agent,
        content: input.content,
        embedding: input.embedding,
        metadata: input.metadata,
        createdAt: new Date().toISOString(),
      };
      if (existingIndex >= 0) this.tables.documents[existingIndex] = record;
      else this.tables.documents.push(record);
    }
    return documents.length;
  }

  async searchDocuments(
    agent: AgentId,
    embedding: number[],
    limit: number,
  ): Promise<ScoredDocument[]> {
    return this.tables.documents
      .filter((doc) => doc.agent === agent)
      .map((doc) => ({
        id: doc.id,
        agent: doc.agent,
        content: doc.content,
        metadata: doc.metadata,
        score: safeCosine(doc.embedding, embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, limit));
  }

  async appendMessages(messages: Omit<StoredMessage, 'id' | 'createdAt'>[]): Promise<void> {
    for (const message of messages) {
      this.tables.messages.push({
        ...message,
        id: id('msg'),
        createdAt: new Date().toISOString(),
      });
    }
  }

  async listMessages(agent: AgentId, limit = 100): Promise<StoredMessage[]> {
    return this.tables.messages.filter((message) => message.agent === agent).slice(-limit);
  }
}

function matchesExercise(candidate: string, query: string): boolean {
  return candidate.toLowerCase().includes(query.toLowerCase());
}

/** `cosineSimilarity` throws on dimension mismatch; a stale embedding must not 500 the app. */
function safeCosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  const score = cosineSimilarity(a, b);
  return Number.isFinite(score) ? score : 0;
}
