import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  VectorDocumentInput,
  Workout,
  WorkoutFilter,
  WorkoutInput,
} from '@/lib/db/types';

type WorkoutRow = {
  id: string;
  date: string;
  exercise: string;
  sets: number;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string | null;
  created_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Task['priority'];
  due_date: string | null;
  project: string | null;
  created_at: string;
  updated_at: string;
};

type NoteRow = { id: string; content: string; source: string; date: string };

type ExpenseRow = {
  id: string;
  date: string;
  merchant: string;
  category: string;
  amount: number;
  note: string | null;
  created_at: string;
};

type ReadingRow = {
  id: string;
  title: string;
  kind: string;
  status: ReadingStatus;
  topic: string | null;
  takeaway: string | null;
  created_at: string;
  updated_at: string;
};

type MatchRow = {
  id: string;
  agent: AgentId;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

type MessageRow = {
  id: string;
  agent: AgentId;
  role: StoredMessage['role'];
  parts: unknown;
  created_at: string;
};

function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  action: string,
): T {
  if (result.error) throw new Error(`Supabase ${action} failed: ${result.error.message}`);
  if (result.data === null) throw new Error(`Supabase ${action} returned no data`);
  return result.data;
}

/** Postgres + pgvector persistence. Schema lives in `supabase/schema.sql`. */
export class SupabaseStore implements CannonStore {
  readonly kind = 'supabase' as const;

  private readonly client: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async logWorkout(input: WorkoutInput): Promise<Workout> {
    const row = unwrap(
      await this.client
        .from('workouts')
        .insert({
          date: input.date,
          exercise: input.exercise,
          sets: input.sets,
          reps: input.reps,
          weight: input.weight,
          rpe: input.rpe,
          notes: input.notes,
        })
        .select()
        .single<WorkoutRow>(),
      'insert workout',
    );
    return toWorkout(row);
  }

  async listWorkouts(filter: WorkoutFilter = {}): Promise<Workout[]> {
    let query = this.client.from('workouts').select('*').order('date', { ascending: false });
    if (filter.exercise) query = query.ilike('exercise', `%${filter.exercise}%`);
    if (filter.since) query = query.gte('date', filter.since);
    const rows = unwrap(await query.returns<WorkoutRow[]>(), 'list workouts');
    return rows.map(toWorkout);
  }

  async createTask(input: TaskInput): Promise<Task> {
    const row = unwrap(
      await this.client
        .from('tasks')
        .insert({
          title: input.title,
          status: input.status,
          priority: input.priority,
          due_date: input.dueDate,
          project: input.project,
        })
        .select()
        .single<TaskRow>(),
      'insert task',
    );
    return toTask(row);
  }

  async listTasks(filter: TaskFilter = {}): Promise<Task[]> {
    let query = this.client.from('tasks').select('*').order('due_date', { ascending: true });
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.priority) query = query.eq('priority', filter.priority);
    if (filter.project) query = query.eq('project', filter.project);
    const rows = unwrap(await query.returns<TaskRow[]>(), 'list tasks');
    return rows.map(toTask);
  }

  async updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null> {
    const { data, error } = await this.client
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .maybeSingle<TaskRow>();
    if (error) throw new Error(`Supabase update task failed: ${error.message}`);
    return data ? toTask(data) : null;
  }

  async addNote(input: Omit<Note, 'id'>): Promise<Note> {
    const row = unwrap(
      await this.client
        .from('notes')
        .insert({ content: input.content, source: input.source, date: input.date })
        .select()
        .single<NoteRow>(),
      'insert note',
    );
    return { id: row.id, content: row.content, source: row.source, date: row.date };
  }

  async listNotes(since?: string): Promise<Note[]> {
    let query = this.client.from('notes').select('*').order('date', { ascending: false });
    if (since) query = query.gte('date', since);
    const rows = unwrap(await query.returns<NoteRow[]>(), 'list notes');
    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      source: row.source,
      date: row.date,
    }));
  }

  async logExpense(input: ExpenseInput): Promise<Expense> {
    const row = unwrap(
      await this.client
        .from('expenses')
        .insert({
          date: input.date,
          merchant: input.merchant,
          category: input.category,
          amount: input.amount,
          note: input.note,
        })
        .select()
        .single<ExpenseRow>(),
      'insert expense',
    );
    return toExpense(row);
  }

  async listExpenses(filter: ExpenseFilter = {}): Promise<Expense[]> {
    let query = this.client.from('expenses').select('*').order('date', { ascending: false });
    if (filter.category) query = query.ilike('category', filter.category);
    if (filter.since) query = query.gte('date', filter.since);
    const rows = unwrap(await query.returns<ExpenseRow[]>(), 'list expenses');
    return rows.map(toExpense);
  }

  async addReading(input: ReadingInput): Promise<ReadingItem> {
    const row = unwrap(
      await this.client
        .from('reading')
        .insert({
          title: input.title,
          kind: input.kind,
          status: input.status,
          topic: input.topic,
          takeaway: input.takeaway,
        })
        .select()
        .single<ReadingRow>(),
      'insert reading item',
    );
    return toReading(row);
  }

  async listReading(filter: ReadingFilter = {}): Promise<ReadingItem[]> {
    let query = this.client.from('reading').select('*').order('updated_at', { ascending: false });
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.topic) query = query.eq('topic', filter.topic);
    const rows = unwrap(await query.returns<ReadingRow[]>(), 'list reading');
    return rows.map(toReading);
  }

  async updateReadingStatus(
    id: string,
    status: ReadingStatus,
    takeaway?: string | null,
  ): Promise<ReadingItem | null> {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (takeaway !== undefined) patch.takeaway = takeaway;
    const { data, error } = await this.client
      .from('reading')
      .update(patch)
      .eq('id', id)
      .select()
      .maybeSingle<ReadingRow>();
    if (error) throw new Error(`Supabase update reading failed: ${error.message}`);
    return data ? toReading(data) : null;
  }

  async upsertDocuments(documents: VectorDocumentInput[]): Promise<number> {
    if (documents.length === 0) return 0;
    const { error } = await this.client.from('documents').insert(
      documents.map((doc) => ({
        agent: doc.agent,
        content: doc.content,
        embedding: doc.embedding,
        metadata: doc.metadata,
      })),
    );
    if (error) throw new Error(`Supabase insert documents failed: ${error.message}`);
    return documents.length;
  }

  async searchDocuments(
    agent: AgentId,
    embedding: number[],
    limit: number,
  ): Promise<ScoredDocument[]> {
    // `match_documents` filters by agent inside the SQL function, so the
    // per-agent boundary is enforced by the database, not only the caller.
    const { data, error } = await this.client.rpc('match_documents', {
      query_embedding: embedding,
      match_agent: agent,
      match_count: limit,
    });
    if (error) throw new Error(`Supabase match documents failed: ${error.message}`);
    const rows = (data ?? []) as MatchRow[];
    return rows.map((row) => ({
      id: row.id,
      agent: row.agent,
      content: row.content,
      metadata: row.metadata ?? {},
      score: row.similarity,
    }));
  }

  async appendMessages(messages: Omit<StoredMessage, 'id' | 'createdAt'>[]): Promise<void> {
    if (messages.length === 0) return;
    const { error } = await this.client
      .from('messages')
      .insert(messages.map((m) => ({ agent: m.agent, role: m.role, parts: m.parts })));
    if (error) throw new Error(`Supabase insert messages failed: ${error.message}`);
  }

  async listMessages(agent: AgentId, limit = 100): Promise<StoredMessage[]> {
    const rows = unwrap(
      await this.client
        .from('messages')
        .select('*')
        .eq('agent', agent)
        .order('created_at', { ascending: false })
        .limit(limit)
        .returns<MessageRow[]>(),
      'list messages',
    );
    return rows
      .map((row) => ({
        id: row.id,
        agent: row.agent,
        role: row.role,
        parts: row.parts,
        createdAt: row.created_at,
      }))
      .reverse();
  }
}

function toWorkout(row: WorkoutRow): Workout {
  return {
    id: row.id,
    date: row.date,
    exercise: row.exercise,
    sets: row.sets,
    reps: row.reps,
    weight: row.weight,
    rpe: row.rpe,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    project: row.project,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    date: row.date,
    merchant: row.merchant,
    category: row.category,
    amount: Number(row.amount),
    note: row.note,
    createdAt: row.created_at,
  };
}

function toReading(row: ReadingRow): ReadingItem {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    topic: row.topic,
    takeaway: row.takeaway,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
