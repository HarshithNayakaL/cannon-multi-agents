import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { AgentDefinition } from '@/lib/agents/types';
import type { CannonStore } from '@/lib/db/types';
import { READING_KINDS, summarizeReading } from '@/lib/agents/learning/logic';
import type { ReadingAddedResult, ReadingUpdatedResult } from '@/lib/agents/tool-results';
import { ingest } from '@/lib/rag/retrieve';

const SYSTEM_PROMPT = `You are the Learning Agent inside Cannon, Harshith's personal multi-agent assistant.

SCOPE
Reading queue, study tracking and retaining what was actually learned. Papers,
books, articles, courses and talks.

DATA
You have retrieval over Harshith's own reading list and the takeaways he wrote.
Quote his own takeaway before summarising anything from memory. If he has not
recorded one, say so rather than inventing what he thought.

TOOLS
- add_reading: capture anything he says he wants to read or is reading.
- list_reading: read the real queue. Call out what has sat queued for a month.
- finish_reading: mark something done and store the takeaway in his words.

STYLE
A sharp study partner. Ask for the takeaway when he finishes something — the
takeaway is the point, not the completion. Terse. No reading-list moralising.`;

const STATUSES = ['queued', 'reading', 'finished'] as const;

function buildTools(store: CannonStore): ToolSet {
  return {
    add_reading: tool({
      description: 'Add something to the reading queue, or mark it as being read right now.',
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        kind: z.enum(READING_KINDS).default('article'),
        status: z.enum(STATUSES).default('queued'),
        topic: z.string().nullable().default(null),
      }),
      execute: async ({ title, kind, status, topic }): Promise<ReadingAddedResult> => {
        const item = await store.addReading({ title, kind, status, topic, takeaway: null });
        await ingest(store, 'learning', `${kind}: ${title}${topic ? ` (${topic})` : ''}`, {
          source: 'reading-list',
          kind,
        });
        return { kind: 'reading-added', item };
      },
    }),

    list_reading: tool({
      description: 'Read the current reading queue, optionally filtered. Flags stale queued items.',
      inputSchema: z.object({
        status: z.enum(STATUSES).nullable().default(null),
        topic: z.string().nullable().default(null),
      }),
      execute: async ({ status, topic }) => {
        const items = await store.listReading({
          status: status ?? undefined,
          topic: topic ?? undefined,
        });
        const filter = [status ? `status=${status}` : null, topic ? `topic=${topic}` : null]
          .filter((part): part is string => part !== null)
          .join(' · ');
        return summarizeReading(items, filter.length > 0 ? filter : 'everything');
      },
    }),

    finish_reading: tool({
      description:
        'Mark a reading item finished and store what was actually learned. Requires the id from list_reading.',
      inputSchema: z.object({
        id: z.string().min(1),
        takeaway: z
          .string()
          .nullable()
          .default(null)
          .describe("The one thing worth remembering, in the user's own words."),
      }),
      execute: async ({ id, takeaway }): Promise<ReadingUpdatedResult> => {
        const item = await store.updateReadingStatus(id, 'finished', takeaway);
        if (item && takeaway) {
          // The takeaway is the durable artefact — it is what retrieval needs.
          await ingest(store, 'learning', `Takeaway from "${item.title}": ${takeaway}`, {
            source: 'takeaway',
            title: item.title,
          });
        }
        return { kind: 'reading-updated', item, requestedId: id };
      },
    }),
  };
}

export const learningAgent: AgentDefinition = {
  id: 'learning',
  name: 'Learning',
  title: 'Learning Agent',
  tagline: 'Reading queue, study tracking, takeaways that stick',
  accent: '#c084fc',
  accentSoft: 'rgba(192, 132, 252, 0.14)',
  systemPrompt: SYSTEM_PROMPT,
  ragSources: ['reading-list', 'takeaway'],
  toolSummaries: [
    {
      name: 'add_reading',
      description: 'Queues a book, paper, article, course or talk.',
      signature: 'add_reading(title, kind, status, topic?)',
    },
    {
      name: 'list_reading',
      description: 'Reads the queue and flags anything stale.',
      signature: 'list_reading(status?, topic?)',
    },
    {
      name: 'finish_reading',
      description: 'Marks an item done and stores the takeaway for retrieval.',
      signature: 'finish_reading(id, takeaway?)',
    },
  ],
  suggestions: [
    'Add the RAG survey paper to my queue',
    "What's still queued?",
    'I finished the Designing Data-Intensive Applications book',
    'What have I actually learned about embeddings?',
  ],
  keywords: [
    'read',
    'reading',
    'book',
    'paper',
    'article',
    'course',
    'study',
    'learn',
    'learning',
    'takeaway',
    'notes on',
    'queue',
    'tutorial',
    'lecture',
    'watched',
  ],
  custom: false,
  buildTools,
};
