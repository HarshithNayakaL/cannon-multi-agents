import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { AgentId, AgentToolSummary } from '@/lib/agents/types';
import type { RecordAddedResult, RecordListResult } from '@/lib/agents/tool-results';
import type { CannonStore } from '@/lib/db/types';
import { ingest } from '@/lib/rag/retrieve';

/**
 * The tool surface every user-created agent gets.
 *
 * A built-in desk has tools shaped like its domain — `log_workout` knows what
 * a set is, `get_spending_summary` knows what a category share is. An agent
 * invented at runtime cannot have that, because nobody wrote the maths for a
 * domain that did not exist five seconds ago.
 *
 * So it gets the honest general case instead: capture a titled entry, search
 * its own entries, count them. That is a real loop — it writes to the
 * database, it re-embeds into the agent's own retrieval namespace, and the
 * next question can find it. It is not a persona with no hands.
 *
 * Everything here is scoped by `agent`, the same way the built-in desks are:
 * a created agent cannot read another agent's records any more than the
 * fitness desk can read work documents.
 */
export function buildCustomTools(agent: AgentId): (store: CannonStore) => ToolSet {
  return (store) => ({
    remember: tool({
      description:
        'Record something worth keeping. Use whenever the user states a fact, a decision, a measurement or an event that they will want back later.',
      inputSchema: z.object({
        title: z.string().min(1).max(200).describe('A short handle for this entry.'),
        body: z
          .string()
          .min(1)
          .max(4000)
          .describe("The detail, in the user's own words wherever possible."),
        tags: z
          .array(z.string().min(1).max(40))
          .max(8)
          .default([])
          .describe('Lowercase single words that group related entries.'),
      }),
      execute: async ({ title, body, tags }): Promise<RecordAddedResult> => {
        const normalized = [...new Set(tags.map((tag) => tag.trim().toLowerCase()))].filter(
          (tag) => tag.length > 0,
        );
        const record = await store.addRecord({ agent, title, body, tags: normalized });

        // Written and embedded in one step. A record the agent cannot later
        // retrieve is a write-only log, which is not memory.
        await ingest(store, agent, `${title}\n${body}`, {
          source: 'record',
          recordId: record.id,
          tags: normalized,
        });

        return { kind: 'record-added', record };
      },
    }),

    recall: tool({
      description:
        "Search this agent's own recorded entries. Call this before answering anything about what the user previously said, rather than guessing from the conversation.",
      inputSchema: z.object({
        query: z
          .string()
          .max(200)
          .nullable()
          .default(null)
          .describe('Words to match against titles and bodies. Omit to list everything.'),
        tag: z.string().max(40).nullable().default(null),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ query, tag, limit }): Promise<RecordListResult> => {
        const records = await store.listRecords(agent, {
          query: query ?? undefined,
          tag: tag ?? undefined,
          limit,
        });

        const filter =
          [query ? `query=${query}` : null, tag ? `tag=${tag}` : null]
            .filter((part): part is string => part !== null)
            .join(' · ') || 'everything';

        const tags = new Map<string, number>();
        for (const record of records) {
          for (const entry of record.tags) tags.set(entry, (tags.get(entry) ?? 0) + 1);
        }

        return {
          kind: 'record-list',
          filter,
          records,
          tags: [...tags.entries()]
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
        };
      },
    }),
  });
}

export const CUSTOM_TOOL_SUMMARIES: AgentToolSummary[] = [
  {
    name: 'remember',
    description: 'Stores a titled entry and embeds it into this agent’s own retrieval scope.',
    signature: 'remember(title, body, tags[])',
  },
  {
    name: 'recall',
    description: 'Searches only this agent’s entries, by text or tag.',
    signature: 'recall(query?, tag?, limit = 20)',
  },
];

export const CUSTOM_RAG_SOURCES = ['record'];
