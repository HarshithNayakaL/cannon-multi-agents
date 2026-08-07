import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { builtinAgents, resolveAgent, toProfile } from '@/lib/agents/registry';
import { BUILTIN_AGENT_IDS, isAgentId } from '@/lib/agents/types';
import { MemoryStore } from '@/lib/db/memory-store';
import {
  financeIntent,
  fitnessIntent,
  lastUserText,
  learningIntent,
  planStep,
  workIntent,
} from '@/lib/ai/demo-model';

describe('registry', () => {
  it('exposes exactly the coded desks', () => {
    expect(builtinAgents.map((agent) => agent.id)).toEqual([...BUILTIN_AGENT_IDS]);
  });

  it('resolves built-in ids without touching the store', async () => {
    // No store passed: a built-in id must never need a database round-trip.
    expect((await resolveAgent('fitness'))?.id).toBe('fitness');
    expect((await resolveAgent('learning'))?.id).toBe('learning');
  });

  it('refuses an id that does not exist instead of defaulting to a desk', async () => {
    const store = new MemoryStore();
    expect(await resolveAgent('accounting', store)).toBeNull();
    expect(await resolveAgent(undefined, store)).toBeNull();
  });

  // The slug becomes a URL segment and a database key, so shape is checked
  // before anything reaches the store.
  it('rejects malformed slugs without querying', () => {
    expect(isAgentId('work')).toBe(true);
    expect(isAgentId('my-garden')).toBe(true);
    expect(isAgentId('Garden')).toBe(false);
    expect(isAgentId('9lives')).toBe(false);
    expect(isAgentId('a--b')).toBe(false);
    expect(isAgentId('trailing-')).toBe(false);
    expect(isAgentId('../etc/passwd')).toBe(false);
    expect(isAgentId('x'.repeat(33))).toBe(false);
    expect(isAgentId(42)).toBe(false);
  });

  // The profile is the server/client boundary. Both of these are server-only:
  // the tool factory closes over the store, and the system prompt is the
  // agent's instructions rather than product surface.
  it('keeps the tool factory and the system prompt out of the client profile', () => {
    for (const agent of builtinAgents) {
      const profile = toProfile(agent) as Record<string, unknown>;
      expect('buildTools' in profile).toBe(false);
      expect('systemPrompt' in profile).toBe(false);
      expect(JSON.stringify(profile)).not.toContain(agent.systemPrompt.slice(0, 40));
    }
  });

  it('documents every tool it actually builds', () => {
    const store = new MemoryStore();
    for (const agent of builtinAgents) {
      const built = Object.keys(agent.buildTools(store)).sort();
      const documented = agent.toolSummaries.map((tool) => tool.name).sort();
      expect(documented).toEqual(built);
    }
  });

  it('gives each desk a distinct accent so no two look alike', () => {
    const accents = new Set(builtinAgents.map((agent) => agent.accent));
    expect(accents.size).toBe(builtinAgents.length);
  });
});

describe('demo model scripting', () => {
  function userPrompt(text: string): LanguageModelV4Prompt {
    return [{ role: 'user', content: [{ type: 'text', text }] }];
  }

  it('reads the most recent user turn', () => {
    expect(
      lastUserText([
        { role: 'user', content: [{ type: 'text', text: 'first' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'reply' }] },
        { role: 'user', content: [{ type: 'text', text: 'second' }] },
      ]),
    ).toBe('second');
  });

  it('parses a logged set into log_workout arguments', () => {
    const step = fitnessIntent('bench press 4x8 @ 72.5kg RPE 8');
    expect(step).toMatchObject({
      toolName: 'log_workout',
      input: { sets: 4, reps: 8, weight: 72.5, rpe: 8 },
    });
  });

  it('routes trend questions to the progress tool with the stated window', () => {
    expect(workIntent('what is slipping?')).toMatchObject({ toolName: 'list_tasks' });
    expect(fitnessIntent('volume trend on squat over the last 6 weeks')).toMatchObject({
      toolName: 'get_progress_summary',
      input: { exercise: 'Squat', rangeDays: 42 },
    });
  });

  it('routes intake questions to the macro tool', () => {
    expect(fitnessIntent('macros for 74kg cutting')).toMatchObject({
      toolName: 'calculate_macros',
      input: { bodyweightKg: 74, goal: 'cut' },
    });
  });

  it('strips the imperative and the priority clause out of a captured task title', () => {
    expect(workIntent('add task: write the Cannon case study, high priority')).toMatchObject({
      toolName: 'create_task',
      input: { title: 'write the Cannon case study', priority: 'high' },
    });
  });

  it('routes note summarisation with an explicit range', () => {
    expect(workIntent('summarise my notes from the last 14 days')).toMatchObject({
      toolName: 'summarize_notes',
      input: { rangeDays: 14 },
    });
  });

  it('will not call a tool the model was not given', () => {
    const step = planStep('fitness', userPrompt('bench press 4x8 @ 70kg'), new Set());
    expect(step.type).toBe('text');
  });

  it('narrates a tool result on the follow-up step', () => {
    const step = planStep(
      'work',
      [
        { role: 'user', content: [{ type: 'text', text: 'what is slipping?' }] },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: '1',
              toolName: 'list_tasks',
              output: {
                type: 'json',
                value: { kind: 'task-list', tasks: [{ id: '1' }], slipping: ['Ship Cannon'] },
              },
            },
          ],
        },
      ],
      new Set(['list_tasks']),
    );
    expect(step.type).toBe('text');
    if (step.type === 'text') expect(step.text).toContain('Ship Cannon');
  });

  it('separates a captured spend from a question about spending', () => {
    // The merchant keeps the user's own casing — "BigBasket", not "Bigbasket".
    expect(financeIntent('spent 840 at BigBasket on groceries')).toMatchObject({
      toolName: 'log_expense',
      input: { merchant: 'BigBasket', amount: 840, category: 'food' },
    });
    expect(financeIntent('spent 120 at the corner shop')).toMatchObject({
      input: { merchant: 'The Corner Shop' },
    });
    expect(financeIntent('how much did I spend in the last 14 days?')).toMatchObject({
      toolName: 'get_spending_summary',
      input: { rangeDays: 14 },
    });
  });

  it('reads a stated budget out of the question instead of assuming one', () => {
    expect(financeIntent('am I under 20000 this month?')).toMatchObject({
      toolName: 'get_spending_summary',
      input: { budget: 20000 },
    });
    expect(financeIntent('what is my spend this month?')).toMatchObject({
      input: { budget: null },
    });
  });

  it('strips a comma out of an amount rather than truncating at it', () => {
    expect(financeIntent('paid 1,250 to the landlord')).toMatchObject({
      input: { amount: 1250, category: 'housing' },
    });
  });

  it('captures a reading title without the queueing verb wrapped around it', () => {
    expect(learningIntent('Add the RAG survey paper to my queue')).toMatchObject({
      toolName: 'add_reading',
      input: { title: 'RAG survey paper', kind: 'paper', status: 'queued' },
    });
  });

  // `finish_reading` needs an id, and the scripted model has no way to know
  // one. Reading the queue is the honest move; inventing an id is not.
  it('answers "I finished X" by reading the queue rather than inventing an id', () => {
    expect(
      learningIntent('I finished the Designing Data-Intensive Applications book'),
    ).toMatchObject({ toolName: 'list_reading' });
  });

  it('routes each desk to its own parser', () => {
    // Same sentence, four desks: only the one that owns the words acts on it.
    const queued = "what's still queued?";
    expect(planStep('learning', userPrompt(queued), new Set(['list_reading'])).type).toBe(
      'tool-call',
    );
    expect(planStep('finance', userPrompt(queued), new Set(['get_spending_summary'])).type).toBe(
      'text',
    );
  });

  it('explains itself when it has no scripted intent', () => {
    const step = planStep('fitness', userPrompt('hello there'), new Set(['log_workout']));
    expect(step.type).toBe('text');
    if (step.type === 'text') expect(step.text).toContain('simulated');
  });
});
