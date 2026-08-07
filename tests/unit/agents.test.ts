import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { agents, getAgent, resolveAgent, toProfile } from '@/lib/agents/registry';
import { AGENT_IDS, isAgentId } from '@/lib/agents/types';
import { fitnessIntent, lastUserText, planStep, workIntent } from '@/lib/ai/demo-model';

describe('registry', () => {
  it('exposes exactly the v1 agents', () => {
    expect(agents.map((agent) => agent.id)).toEqual([...AGENT_IDS]);
  });

  it('resolves known ids and refuses unknown ones instead of defaulting', () => {
    expect(resolveAgent('fitness')?.id).toBe('fitness');
    expect(resolveAgent('finance')).toBeNull();
    expect(resolveAgent(undefined)).toBeNull();
    expect(isAgentId('work')).toBe(true);
  });

  it('keeps the tool factory out of the client profile', () => {
    const profile = toProfile(getAgent('fitness'));
    expect('buildTools' in profile).toBe(false);
    expect(profile.systemPrompt).toContain('Fitness Agent');
  });

  it('documents every tool it actually builds', () => {
    for (const agent of agents) {
      const built = Object.keys(agent.buildTools()).sort();
      const documented = agent.toolSummaries.map((tool) => tool.name).sort();
      expect(documented).toEqual(built);
    }
  });

  it('gives each agent a distinct accent so the two desks never look alike', () => {
    const accents = new Set(agents.map((agent) => agent.accent));
    expect(accents.size).toBe(agents.length);
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

  it('explains itself when it has no scripted intent', () => {
    const step = planStep('fitness', userPrompt('hello there'), new Set(['log_workout']));
    expect(step.type).toBe('text');
    if (step.type === 'text') expect(step.text).toContain('simulated');
  });
});
