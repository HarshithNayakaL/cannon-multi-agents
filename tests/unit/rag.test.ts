import { describe, expect, it } from 'vitest';

import { MemoryStore } from '@/lib/db/memory-store';
import { semanticChunks } from '@/lib/rag/chunk';
import { EMBEDDING_DIMENSIONS, localEmbedding, tokenize } from '@/lib/rag/embeddings';
import { formatContext, ingest, retrieve } from '@/lib/rag/retrieve';

describe('semanticChunks', () => {
  it('returns nothing for empty input', () => {
    expect(semanticChunks('   \n  ')).toEqual([]);
  });

  it('splits on paragraph boundaries rather than a fixed window', () => {
    const chunks = semanticChunks('First paragraph here.\n\nSecond paragraph here.');
    expect(chunks).toEqual(['First paragraph here.', 'Second paragraph here.']);
  });

  it('treats bullets as their own units', () => {
    const chunks = semanticChunks('Agenda:\n- ship cannon today\n- write the case study');
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((chunk) => chunk.includes('ship cannon'))).toBe(true);
  });

  it('packs sentences when a single unit exceeds the budget', () => {
    const long = `${'Sentence about training. '.repeat(60)}`;
    const chunks = semanticChunks(long, 200);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(200);
  });

  it('hard-splits a single sentence that is longer than the budget', () => {
    const chunks = semanticChunks('x'.repeat(500), 100);
    expect(chunks.length).toBe(5);
  });
});

describe('localEmbedding', () => {
  it('is deterministic and correctly sized', () => {
    const a = localEmbedding('bench press 4x8 at 70kg');
    const b = localEmbedding('bench press 4x8 at 70kg');
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(a).toEqual(b);
  });

  it('produces unit vectors so cosine similarity is well behaved', () => {
    const vector = localEmbedding('progressive overload guidance');
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('returns a zero vector rather than NaN for empty text', () => {
    const vector = localEmbedding('');
    expect(vector.every((value) => value === 0)).toBe(true);
  });

  it('scores lexically related text above unrelated text', () => {
    const query = localEmbedding('squat volume trend');
    const near = localEmbedding('squat volume went up this week');
    const far = localEmbedding('meeting notes about invoicing');
    const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
    expect(dot(query, near)).toBeGreaterThan(dot(query, far));
  });

  it('drops punctuation and single characters when tokenising', () => {
    expect(tokenize('Bench, press! a 4x8.')).toEqual(['bench', 'press', '4x8']);
  });
});

describe('retrieval scoping', () => {
  async function seeded() {
    const store = new MemoryStore();
    await ingest(store, 'fitness', 'Bench press progression stalled at 72.5kg this month.', {
      source: 'workout-log',
    });
    await ingest(store, 'work', 'Bench marking the deploy pipeline is blocked on the PRD.', {
      source: 'project-notes',
    });
    return store;
  }

  it('never returns another agent documents', async () => {
    const store = await seeded();
    const trace = await retrieve(store, 'fitness', 'bench');
    expect(trace.hits.length).toBeGreaterThan(0);
    for (const hit of trace.hits) expect(hit.source).toBe('workout-log');
  });

  it('scopes the mirror-image query the same way', async () => {
    const store = await seeded();
    const trace = await retrieve(store, 'work', 'bench');
    for (const hit of trace.hits) expect(hit.source).toBe('project-notes');
  });

  it('returns an empty trace for a blank query without embedding anything', async () => {
    const store = await seeded();
    const trace = await retrieve(store, 'fitness', '   ');
    expect(trace.hits).toEqual([]);
  });

  it('filters out matches below the relevance floor', async () => {
    const store = await seeded();
    const trace = await retrieve(store, 'fitness', 'completely unrelated xylophone parade');
    expect(trace.hits).toEqual([]);
  });

  it('reports how many chunks were ingested', async () => {
    const store = new MemoryStore();
    const result = await ingest(store, 'work', 'One thought.\n\nAnother thought.', {
      source: 'notes',
    });
    expect(result.chunks).toBe(2);
    expect(result.backend).toBe('local');
  });

  it('tells the model plainly when nothing was retrieved', () => {
    const context = formatContext({ agent: 'work', query: 'x', backend: 'local', hits: [] });
    expect(context).toContain('none');
  });

  it('numbers and scores the context block it hands the model', () => {
    const context = formatContext({
      agent: 'fitness',
      query: 'bench',
      backend: 'local',
      hits: [{ content: 'Bench 4x8 @ 70kg', score: 0.71, source: 'workout-log' }],
    });
    expect(context).toContain('[1]');
    expect(context).toContain('workout-log');
    expect(context).toContain('0.71');
  });
});
