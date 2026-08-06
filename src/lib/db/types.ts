import type { AgentId } from '@/lib/agents/types';

export type WorkoutSet = {
  exercise: string;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number;
};

export type Workout = {
  id: string;
  date: string;
  exercise: string;
  sets: number;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string | null;
  createdAt: string;
};

export type WorkoutInput = Omit<Workout, 'id' | 'createdAt'>;

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  project: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

export type Note = {
  id: string;
  content: string;
  source: string;
  date: string;
};

/** A chunk of text embedded for retrieval, hard-scoped to one agent. */
export type VectorDocument = {
  id: string;
  agent: AgentId;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type VectorDocumentInput = Omit<VectorDocument, 'id' | 'createdAt'> & {
  id?: string;
};

export type ScoredDocument = {
  id: string;
  agent: AgentId;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
};

export type StoredMessage = {
  id: string;
  agent: AgentId;
  role: 'user' | 'assistant' | 'system';
  parts: unknown;
  createdAt: string;
};

export type TaskFilter = {
  status?: TaskStatus;
  priority?: TaskPriority;
  project?: string;
};

export type WorkoutFilter = {
  exercise?: string;
  /** Inclusive lower bound, ISO date. */
  since?: string;
};

export interface CannonStore {
  readonly kind: 'supabase' | 'memory';

  logWorkout(input: WorkoutInput): Promise<Workout>;
  listWorkouts(filter?: WorkoutFilter): Promise<Workout[]>;

  createTask(input: TaskInput): Promise<Task>;
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  updateTaskStatus(id: string, status: TaskStatus): Promise<Task | null>;

  addNote(input: Omit<Note, 'id'>): Promise<Note>;
  listNotes(since?: string): Promise<Note[]>;

  upsertDocuments(documents: VectorDocumentInput[]): Promise<number>;
  searchDocuments(agent: AgentId, embedding: number[], limit: number): Promise<ScoredDocument[]>;

  appendMessages(messages: Omit<StoredMessage, 'id' | 'createdAt'>[]): Promise<void>;
  listMessages(agent: AgentId, limit?: number): Promise<StoredMessage[]>;
}
