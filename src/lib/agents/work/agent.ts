import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { AgentDefinition } from '@/lib/agents/types';
import { describeFilter, findSlipping, summarizeNotes } from '@/lib/agents/work/logic';
import type {
  TaskCreatedResult,
  TaskListResult,
  TaskUpdatedResult,
} from '@/lib/agents/tool-results';
import { getStore } from '@/lib/db';
import { ingest } from '@/lib/rag/retrieve';
import { daysAgoISO } from '@/lib/utils';

const SYSTEM_PROMPT = `You are the Work Agent inside Cannon, Harshith's personal multi-agent assistant.

SCOPE
Task capture, prioritisation, project status tracking and notes summarisation for
Harshith's AI engineering work and portfolio pipeline.

DATA
You have retrieval over project notes, PRDs and operating principles. Check the retrieved
context and the tools before answering. Never invent a task, a deadline or a status.

TOOLS
- create_task: capture anything phrased as a commitment, even loosely.
- list_tasks: read real state before summarising. Surface what is overdue or slipping
  without being asked.
- update_task_status: move a task when the user reports progress.
- summarize_notes: pull the notes window before summarising a period.

STYLE
Efficient chief of staff. Prioritisation first, terse status, no corporate tone, no
restating what the user already knows. Lead with what is at risk.`;

const STATUSES = ['todo', 'doing', 'blocked', 'done'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;

function buildTools(): ToolSet {
  return {
    create_task: tool({
      description: 'Capture a new task. Use whenever the user commits to doing something.',
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        priority: z.enum(PRIORITIES).default('medium'),
        status: z.enum(STATUSES).default('todo'),
        dueDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .default(null)
          .describe('ISO date, or null when open-ended.'),
        project: z.string().nullable().default(null),
      }),
      execute: async ({
        title,
        priority,
        status,
        dueDate,
        project,
      }): Promise<TaskCreatedResult> => {
        const store = await getStore();
        const task = await store.createTask({ title, priority, status, dueDate, project });
        return { kind: 'task-created', task };
      },
    }),

    list_tasks: tool({
      description:
        'Read the current task list, optionally filtered. Returns which items are slipping.',
      inputSchema: z.object({
        status: z.enum(STATUSES).nullable().default(null),
        priority: z.enum(PRIORITIES).nullable().default(null),
        project: z.string().nullable().default(null),
      }),
      execute: async ({ status, priority, project }): Promise<TaskListResult> => {
        const store = await getStore();
        const tasks = await store.listTasks({
          status: status ?? undefined,
          priority: priority ?? undefined,
          project: project ?? undefined,
        });
        return {
          kind: 'task-list',
          filter: describeFilter({
            status: status ?? undefined,
            priority: priority ?? undefined,
            project: project ?? undefined,
          }),
          tasks,
          slipping: findSlipping(tasks),
        };
      },
    }),

    update_task_status: tool({
      description: 'Move a task to a new status. Requires the task id from list_tasks.',
      inputSchema: z.object({
        id: z.string().min(1),
        status: z.enum(STATUSES),
      }),
      execute: async ({ id, status }): Promise<TaskUpdatedResult> => {
        const store = await getStore();
        const task = await store.updateTaskStatus(id, status);
        return { kind: 'task-updated', task, requestedId: id };
      },
    }),

    summarize_notes: tool({
      description: 'Pull notes from the last N days so a period can be summarised from real text.',
      inputSchema: z.object({
        rangeDays: z.number().int().min(1).max(180).default(7),
      }),
      execute: async ({ rangeDays }) => {
        const store = await getStore();
        const notes = await store.listNotes(daysAgoISO(rangeDays));
        return summarizeNotes(notes, rangeDays);
      },
    }),
  };
}

export const workAgent: AgentDefinition = {
  id: 'work',
  name: 'Work',
  title: 'Work Agent',
  tagline: 'Task capture, prioritisation, status truth',
  accent: '#0A84FF',
  accentSoft: 'rgba(10, 132, 255, 0.16)',
  systemPrompt: SYSTEM_PROMPT,
  ragSources: ['project-notes', 'operating-notes'],
  toolSummaries: [
    {
      name: 'create_task',
      description: 'Captures a commitment as a tracked task.',
      signature: 'create_task(title, priority, status, dueDate?, project?)',
    },
    {
      name: 'list_tasks',
      description: 'Reads real task state and flags what is slipping.',
      signature: 'list_tasks(status?, priority?, project?)',
    },
    {
      name: 'update_task_status',
      description: 'Moves a task between todo / doing / blocked / done.',
      signature: 'update_task_status(id, status)',
    },
    {
      name: 'summarize_notes',
      description: 'Pulls the notes window before summarising a period.',
      signature: 'summarize_notes(rangeDays = 7)',
    },
  ],
  suggestions: [
    "What's slipping this week?",
    'Add task: write the Cannon case study, high priority, due Friday',
    'Summarise my notes from the last 7 days',
    'Show everything blocked',
  ],
  buildTools,
};

/** Ingest a free-text note into the work knowledge base. */
export async function captureNote(content: string, source: string, date: string) {
  const store = await getStore();
  const note = await store.addNote({ content, source, date });
  await ingest(store, 'work', `${date} (${source}) — ${content}`, { source, date });
  return note;
}
