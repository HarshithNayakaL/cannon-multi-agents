import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { AgentDefinition } from '@/lib/agents/types';
import type { CannonStore } from '@/lib/db/types';
import {
  calculateMacros,
  isLowerBodyLift,
  suggestNextLoad,
  summarizeProgress,
} from '@/lib/agents/fitness/logic';
import type { WorkoutLoggedResult } from '@/lib/agents/tool-results';
import { ingest } from '@/lib/rag/retrieve';
import { daysAgoISO, today } from '@/lib/utils';

const SYSTEM_PROMPT = `You are the Fitness Agent inside Cannon, Harshith's personal multi-agent assistant.

SCOPE
Strength training tracking, progressive overload guidance, and macro/calorie awareness.
You are not a doctor. Flag and defer on anything medical, injury-related or diagnostic.

DATA
You have retrieval over Harshith's own workout log and training principles. Always check
the retrieved context and the tools before offering generic advice. If the log does not
contain what you need, say so instead of inventing history.

TOOLS
- log_workout: record a completed set. Use it whenever a session is described in the past tense.
- get_progress_summary: pull real volume and load history before commenting on a trend.
- calculate_macros: only when asked about intake. Ask for bodyweight if it is unknown.

STYLE
Direct, data-driven coach. Lead with the number, then the recommendation. No motivational
filler, no hedging on programming decisions, no restating what the user just told you.
Keep responses under six lines unless the user asks for detail.`;

function buildTools(store: CannonStore): ToolSet {
  return {
    log_workout: tool({
      description:
        'Record a completed strength set in the workout log. Use for any session described in the past tense.',
      inputSchema: z.object({
        exercise: z.string().min(1).describe('Exercise name, e.g. "Bench Press".'),
        sets: z.number().int().min(1).max(20),
        reps: z.number().int().min(1).max(100),
        weight: z.number().min(0).max(500).describe('Load in kilograms.'),
        rpe: z
          .number()
          .min(1)
          .max(10)
          .nullable()
          .default(null)
          .describe('Rate of perceived exertion, 1-10.'),
        notes: z.string().nullable().default(null),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .default(null)
          .describe('ISO date. Defaults to today when omitted.'),
      }),
      execute: async ({
        exercise,
        sets,
        reps,
        weight,
        rpe,
        notes,
        date,
      }): Promise<WorkoutLoggedResult> => {
        const workout = await store.logWorkout({
          date: date ?? today(),
          exercise,
          sets,
          reps,
          weight,
          rpe,
          notes,
        });

        const nextLoad = suggestNextLoad(weight, rpe, isLowerBodyLift(exercise));

        // Every logged set also becomes retrievable context for later questions.
        await ingest(
          store,
          'fitness',
          `${workout.date} — ${exercise} ${sets}x${reps} @ ${weight}kg${
            rpe ? ` (RPE ${rpe})` : ''
          }${notes ? `. ${notes}` : ''}`,
          { source: 'workout-log', date: workout.date, exercise },
        );

        return {
          kind: 'workout-logged',
          workout,
          nextLoad,
          note:
            nextLoad === null
              ? 'No RPE given, so no load recommendation.'
              : nextLoad < weight
                ? `RPE ${rpe} is a grinder — back off to ${nextLoad}kg and rebuild.`
                : nextLoad === weight
                  ? `RPE ${rpe} — hold ${weight}kg until it moves faster.`
                  : `Next session: ${nextLoad}kg.`,
        };
      },
    }),

    get_progress_summary: tool({
      description:
        'Compute real volume and load history for one exercise over a window. Call before commenting on any trend.',
      inputSchema: z.object({
        exercise: z.string().min(1).describe('Exercise name or partial match, e.g. "squat".'),
        rangeDays: z.number().int().min(7).max(365).default(42),
      }),
      execute: async ({ exercise, rangeDays }) => {
        const workouts = await store.listWorkouts({
          exercise,
          since: daysAgoISO(rangeDays),
        });
        return summarizeProgress(workouts, exercise, rangeDays);
      },
    }),

    calculate_macros: tool({
      description:
        'Derive a calorie and macronutrient target from bodyweight, activity level and goal.',
      inputSchema: z.object({
        bodyweightKg: z.number().min(30).max(250),
        activity: z.enum(['sedentary', 'light', 'moderate', 'high']).default('moderate'),
        goal: z.enum(['cut', 'maintain', 'bulk']).default('maintain'),
      }),
      execute: async ({ bodyweightKg, activity, goal }) =>
        calculateMacros(bodyweightKg, activity, goal),
    }),
  };
}

export const fitnessAgent: AgentDefinition = {
  id: 'fitness',
  name: 'Fitness',
  title: 'Fitness Agent',
  tagline: 'Strength log, overload guidance, intake targets',
  accent: '#FF9F0A',
  accentSoft: 'rgba(255, 159, 10, 0.16)',
  systemPrompt: SYSTEM_PROMPT,
  ragSources: ['workout-log', 'training-principles'],
  toolSummaries: [
    {
      name: 'log_workout',
      description: 'Records a completed set and re-embeds it for retrieval.',
      signature: 'log_workout(exercise, sets, reps, weight, rpe?, notes?, date?)',
    },
    {
      name: 'get_progress_summary',
      description: 'Volume, top load and trend verdict for one lift.',
      signature: 'get_progress_summary(exercise, rangeDays = 42)',
    },
    {
      name: 'calculate_macros',
      description: 'Calorie and macro split from bodyweight, activity and goal.',
      signature: 'calculate_macros(bodyweightKg, activity, goal)',
    },
  ],
  suggestions: [
    'Log today: bench 4x8 @ 72.5kg, RPE 8',
    "What's my volume trend on bench over the last 6 weeks?",
    "I'm stalling on squat — what would you change?",
    'Macros for 74kg, moderate activity, cutting',
  ],
  keywords: [
    'workout',
    'lift',
    'bench',
    'squat',
    'deadlift',
    'press',
    'reps',
    'sets',
    'rpe',
    'gym',
    'training',
    'macros',
    'protein',
    'calories',
    'volume',
    'stalling',
    'kg',
    'muscle',
    'cardio',
    'session',
  ],
  custom: false,
  buildTools,
};
