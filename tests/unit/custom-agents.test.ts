import { describe, expect, it } from 'vitest';

import { defaultName, fallbackSpec, pickAccent } from '@/lib/agents/custom/generate';
import { buildCustomTools, CUSTOM_TOOL_SUMMARIES } from '@/lib/agents/custom/tools';
import { hydrate, softenAccent, toProfile } from '@/lib/agents/registry';
import { isAgentId, isReservedAgentId, toSlug } from '@/lib/agents/types';
import { MemoryStore } from '@/lib/db/memory-store';
import { customIntent } from '@/lib/ai/demo-model';
import type { CustomAgent } from '@/lib/agents/types';
import type { ToolSet } from 'ai';

/**
 * `ToolSet` erases each tool's input type, so `execute` presents overloads
 * that no concrete object satisfies. Narrowing once here keeps the cast out
 * of every call site.
 */
function exec(tools: ToolSet, name: string) {
  const run = tools[name]?.execute;
  if (!run) throw new Error(`${name} has no execute`);
  return run as unknown as (input: Record<string, unknown>) => Promise<unknown>;
}

function stored(id: string, overrides: Partial<CustomAgent> = {}): CustomAgent {
  return {
    id,
    name: 'Garden',
    title: 'Garden Agent',
    tagline: 'Watering, feeding, what died and why',
    accent: '#68de7a',
    systemPrompt: 'You are the Garden Agent inside Cannon.',
    keywords: ['plant', 'water', 'soil'],
    suggestions: ['Remember the ficus was repotted'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('slugs', () => {
  it('turns free text into a usable URL segment', () => {
    expect(toSlug('Houseplants')).toBe('houseplants');
    expect(toSlug('My Garden!')).toBe('my-garden');
    expect(toSlug('  spaced   out  ')).toBe('spaced-out');
  });

  // A generated slug becomes a route and a primary key, so anything that is
  // not a clean slug has to be rejected rather than patched into one.
  it('refuses what cannot become a slug rather than emitting a broken one', () => {
    expect(toSlug('!!!')).toBeNull();
    expect(toSlug('')).toBeNull();
    expect(toSlug('123')).toBeNull();
    expect(toSlug('../../etc/passwd')).toBe('etc-passwd');
  });

  it('strips a leading non-letter instead of producing an invalid slug', () => {
    const slug = toSlug('3D printing');
    expect(slug).toBe('d-printing');
    expect(isAgentId(slug!)).toBe(true);
  });

  it('knows which segments the app owns', () => {
    expect(isReservedAgentId('api')).toBe(true);
    expect(isReservedAgentId('new')).toBe(true);
    expect(isReservedAgentId('garden')).toBe(false);
  });
});

describe('generated specs', () => {
  it('produces a working agent with no provider key at all', () => {
    const spec = fallbackSpec('track my houseplants and when I water them', 'Houseplants');

    expect(spec.title).toBe('Houseplants Agent');
    expect(spec.keywords.length).toBeGreaterThan(2);
    expect(spec.suggestions.length).toBeGreaterThan(2);
    // The prompt must name the real tools. A prompt promising tools the agent
    // does not have is how an agent starts hallucinating capabilities.
    expect(spec.systemPrompt).toContain('remember');
    expect(spec.systemPrompt).toContain('recall');
    // Short enough to survive whole.
    expect(spec.suggestions[0]).toBe('Remember that track my houseplants and when I water them');
  });

  // A starter prompt that ends mid-word reads as a bug in the product.
  it('truncates a long description on a word boundary', () => {
    const spec = fallbackSpec(
      'track my houseplants, when I water them and which ones are struggling in the north window',
      'Houseplants',
    );
    // Ends on a whole word plus an ellipsis, never a severed one.
    expect(spec.suggestions[0]).toMatch(/…$/);
    expect(spec.suggestions[0]).toBe(
      'Remember that track my houseplants, when I water them and which ones are…',
    );
  });

  it('names the desk after the first meaningful word, not the filler', () => {
    expect(defaultName('I want to track my houseplants')).toBe('Houseplants');
    expect(defaultName('something for managing recipes')).toBe('Recipes');
    expect(defaultName('the the the')).toBe('Desk');
  });

  it('never hands out an accent already in use while one is free', () => {
    const taken = ['#5ac8fa', '#ff6482', '#66d4cf', '#ffd426'];
    for (let i = 0; i < 20; i += 1) {
      expect(taken).not.toContain(pickAccent(taken));
    }
  });

  it('still returns an accent once the palette is exhausted', () => {
    const everything = Array.from({ length: 20 }, (_, i) => `#00000${i % 10}`);
    expect(pickAccent([...everything, pickAccent([])])).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('hydration', () => {
  it('gives a stored agent the same shape as a coded one', () => {
    const agent = hydrate(stored('garden'));

    expect(agent.custom).toBe(true);
    expect(agent.accentSoft).toBe('rgba(104, 222, 122, 0.14)');
    expect(agent.toolSummaries).toEqual(CUSTOM_TOOL_SUMMARIES);
    expect(Object.keys(agent.buildTools(new MemoryStore())).sort()).toEqual(['recall', 'remember']);
  });

  it('keeps a created agent’s prompt out of the client profile too', () => {
    const profile = toProfile(hydrate(stored('garden'))) as Record<string, unknown>;
    expect('systemPrompt' in profile).toBe(false);
    expect('buildTools' in profile).toBe(false);
  });

  it('survives a malformed accent rather than emitting broken CSS', () => {
    expect(softenAccent('not-a-colour')).toMatch(/^rgba\(/);
    expect(softenAccent('#abc')).toBe('rgba(170, 187, 204, 0.14)');
  });
});

describe('the generic tool surface', () => {
  it('records an entry and reads it back', async () => {
    const store = new MemoryStore();
    await store.createAgent(stored('garden'));

    const record = await store.addRecord({
      agent: 'garden',
      title: 'Ficus repotted',
      body: 'Moved to a 30cm pot with fresh compost.',
      tags: ['ficus'],
    });

    expect(record.id).toBeTruthy();
    expect(await store.listRecords('garden')).toHaveLength(1);
    expect(await store.listRecords('garden', { query: 'compost' })).toHaveLength(1);
    expect(await store.listRecords('garden', { query: 'orchid' })).toHaveLength(0);
    expect(await store.listRecords('garden', { tag: 'ficus' })).toHaveLength(1);
    expect(await store.listRecords('garden', { tag: 'orchid' })).toHaveLength(0);
  });

  // The same boundary the coded desks get: an agent cannot see another's data.
  it('scopes records to their own agent', async () => {
    const store = new MemoryStore();
    await store.addRecord({ agent: 'garden', title: 'a', body: 'a', tags: [] });
    await store.addRecord({ agent: 'recipes', title: 'b', body: 'b', tags: [] });

    expect(await store.listRecords('garden')).toHaveLength(1);
    expect((await store.listRecords('recipes'))[0].title).toBe('b');
  });

  it('normalises tags so #Ficus and #ficus are the same bucket', async () => {
    const store = new MemoryStore();
    const tools = buildCustomTools('garden')(store);

    await exec(
      tools,
      'remember',
    )({ title: 'One', body: 'body', tags: ['Ficus', ' ficus ', 'FICUS'] });

    const [record] = await store.listRecords('garden');
    expect(record.tags).toEqual(['ficus']);
  });

  it('reports a tag histogram so a created desk still has a readout', async () => {
    const store = new MemoryStore();
    const tools = buildCustomTools('garden')(store);

    for (const tags of [['ficus'], ['ficus'], ['orchid']]) {
      await exec(tools, 'remember')({ title: 't', body: 'b', tags });
    }

    const result = (await exec(tools, 'recall')({ query: null, tag: null, limit: 20 })) as {
      kind: string;
      tags: { tag: string; count: number }[];
    };

    expect(result.kind).toBe('record-list');
    expect(result.tags).toEqual([
      { tag: 'ficus', count: 2 },
      { tag: 'orchid', count: 1 },
    ]);
  });

  it('embeds what it records, so the next question can retrieve it', async () => {
    const store = new MemoryStore();
    const tools = buildCustomTools('garden')(store);

    await exec(tools, 'remember')({ title: 'Ficus', body: 'watered on Sundays', tags: [] });

    // A record that is written but never embedded is a write-only log.
    expect(await store.searchDocuments('garden', new Array(768).fill(0.1), 4)).not.toHaveLength(0);
  });
});

describe('deleting a created agent', () => {
  it('takes its records, embeddings and transcript with it', async () => {
    const store = new MemoryStore();
    await store.createAgent(stored('garden'));
    await store.addRecord({ agent: 'garden', title: 'a', body: 'a', tags: [] });
    await store.upsertDocuments([
      { agent: 'garden', content: 'a', embedding: new Array(768).fill(0.1), metadata: {} },
    ]);
    await store.appendMessages([{ agent: 'garden', role: 'user', parts: [] }]);

    expect(await store.deleteAgent('garden')).toBe(true);

    // Anything left behind would be inherited by the next agent created under
    // the same slug.
    expect(await store.listRecords('garden')).toHaveLength(0);
    expect(await store.searchDocuments('garden', new Array(768).fill(0.1), 4)).toHaveLength(0);
    expect(await store.listMessages('garden')).toHaveLength(0);
    expect(await store.findAgent('garden')).toBeNull();
  });

  it('reports honestly when there was nothing to delete', async () => {
    expect(await new MemoryStore().deleteAgent('never-existed')).toBe(false);
  });

  it('leaves other agents untouched', async () => {
    const store = new MemoryStore();
    await store.createAgent(stored('garden'));
    await store.createAgent(stored('recipes', { name: 'Recipes' }));
    await store.addRecord({ agent: 'recipes', title: 'keep', body: 'me', tags: [] });

    await store.deleteAgent('garden');

    expect(await store.listAgents()).toHaveLength(1);
    expect(await store.listRecords('recipes')).toHaveLength(1);
  });
});

describe('the scripted parser for a created agent', () => {
  it('treats a statement as something to remember', () => {
    expect(customIntent('remember that the ficus gets watered on Sundays')).toMatchObject({
      toolName: 'remember',
      input: { body: 'the ficus gets watered on Sundays' },
    });
    expect(customIntent('the orchid is on the north window')).toMatchObject({
      toolName: 'remember',
    });
  });

  it('treats a question as something to recall', () => {
    expect(customIntent('what have I recorded?')).toMatchObject({
      toolName: 'recall',
      input: { query: null },
    });
    expect(customIntent('when did I last water the ficus?')).toMatchObject({
      toolName: 'recall',
    });
  });

  // "did I water it" starts with a statement-shaped word but ends in a
  // question mark, and the question mark is the stronger signal.
  it('does not record a question just because it starts like a statement', () => {
    expect(customIntent('i watered the ficus?')).toMatchObject({ toolName: 'recall' });
    expect(customIntent('i watered the ficus')).toMatchObject({ toolName: 'remember' });
  });

  it('pulls a hashtag out as a tag filter', () => {
    expect(customIntent('show me everything #ficus')).toMatchObject({
      toolName: 'recall',
      input: { tag: 'ficus' },
    });
  });

  it('titles a record from its first clause rather than the whole body', () => {
    const step = customIntent(
      'remember the ficus was repotted today. It went into a 30cm pot with fresh compost.',
    );
    expect(step).toMatchObject({ input: { title: 'the ficus was repotted today' } });
  });

  it('has nothing to say about an empty turn', () => {
    expect(customIntent('   ')).toBeNull();
  });
});
