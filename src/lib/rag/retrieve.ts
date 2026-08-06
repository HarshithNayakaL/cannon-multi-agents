import type { AgentId } from '@/lib/agents/types';
import type { CannonStore, ScoredDocument } from '@/lib/db/types';
import { semanticChunks } from '@/lib/rag/chunk';
import { embedText, embedTexts, type EmbeddingBackend } from '@/lib/rag/embeddings';

export type RetrievalHit = {
  content: string;
  score: number;
  source: string;
};

export type RetrievalTrace = {
  agent: AgentId;
  query: string;
  backend: EmbeddingBackend;
  hits: RetrievalHit[];
};

/** Similarity floor. Below this a "match" is noise and hurts the prompt. */
export const MIN_RELEVANCE = 0.05;

/**
 * Per-agent retrieval.
 *
 * The agent id is passed to the store rather than filtered afterwards: the
 * fitness agent must not be able to see work documents even by accident, so
 * the boundary sits in the query, not in a post-filter the caller can forget.
 */
export async function retrieve(
  store: CannonStore,
  agent: AgentId,
  query: string,
  limit = 4,
): Promise<RetrievalTrace> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { agent, query: trimmed, backend: 'local', hits: [] };
  }

  const { embedding, backend } = await embedText(trimmed);
  const documents = await store.searchDocuments(agent, embedding, limit);

  return {
    agent,
    query: trimmed,
    backend,
    hits: documents.filter((doc) => doc.score >= MIN_RELEVANCE).map(toHit),
  };
}

function toHit(document: ScoredDocument): RetrievalHit {
  const source = typeof document.metadata.source === 'string' ? document.metadata.source : 'memory';
  return { content: document.content, score: Number(document.score.toFixed(4)), source };
}

/** Chunk, embed and persist a blob of text into one agent's knowledge base. */
export async function ingest(
  store: CannonStore,
  agent: AgentId,
  content: string,
  metadata: Record<string, unknown> = {},
): Promise<{ chunks: number; backend: EmbeddingBackend }> {
  const chunks = semanticChunks(content);
  if (chunks.length === 0) return { chunks: 0, backend: 'local' };

  const { embeddings, backend } = await embedTexts(chunks);
  await store.upsertDocuments(
    chunks.map((chunk, index) => ({
      agent,
      content: chunk,
      embedding: embeddings[index],
      metadata: { ...metadata, chunkIndex: index },
    })),
  );

  return { chunks: chunks.length, backend };
}

/** Render retrieved context as the grounding block appended to a system prompt. */
export function formatContext(trace: RetrievalTrace): string {
  if (trace.hits.length === 0) {
    return 'RETRIEVED CONTEXT: none. Say so plainly rather than inventing history.';
  }
  const body = trace.hits
    .map((hit, index) => `[${index + 1}] (${hit.source}, score ${hit.score}) ${hit.content}`)
    .join('\n');
  return `RETRIEVED CONTEXT (${trace.agent} knowledge base only):\n${body}`;
}
