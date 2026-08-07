import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

import type { AgentId } from '@/lib/agents/types';

/**
 * Deterministic stand-in language model.
 *
 * Cannon ships with no secrets committed, so with zero provider keys the app
 * must still run the *entire* production path: the same route handler, the
 * same tool definitions, the same streaming protocol, the same persistence.
 * This model implements the provider interface directly and scripts plausible
 * tool calls from the user's text, so the demo exercises real code instead of
 * a mocked-out shortcut. It is replaced by Groq the moment a key exists.
 */

const STOP: LanguageModelV4FinishReason = { unified: 'stop', raw: 'stop' };
const TOOL_CALLS: LanguageModelV4FinishReason = { unified: 'tool-calls', raw: 'tool_calls' };

const ZERO_USAGE: LanguageModelV4Usage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

export type TextStep = { type: 'text'; text: string };
export type ToolCallStep = { type: 'tool-call'; toolName: string; input: Record<string, unknown> };
export type ScriptedStep = TextStep | ToolCallStep;

export class DemoLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'cannon-demo';
  readonly modelId: string;
  readonly supportedUrls = {};

  private sequence = 0;

  constructor(private readonly agent: AgentId) {
    this.modelId = `simulated-${agent}`;
  }

  async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    const step = this.plan(options);
    const content: LanguageModelV4Content[] =
      step.type === 'text'
        ? [{ type: 'text', text: step.text }]
        : [
            {
              type: 'tool-call',
              toolCallId: this.nextId(),
              toolName: step.toolName,
              input: JSON.stringify(step.input),
            },
          ];

    return {
      content,
      finishReason: step.type === 'text' ? STOP : TOOL_CALLS,
      usage: ZERO_USAGE,
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
    const step = this.plan(options);
    const id = this.nextId();

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start: async (controller) => {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({
          type: 'response-metadata',
          id,
          modelId: this.modelId,
          timestamp: new Date(),
        });

        if (step.type === 'tool-call') {
          const input = JSON.stringify(step.input);
          controller.enqueue({ type: 'tool-input-start', id, toolName: step.toolName });
          controller.enqueue({ type: 'tool-input-delta', id, delta: input });
          controller.enqueue({ type: 'tool-input-end', id });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: id,
            toolName: step.toolName,
            input,
          });
          controller.enqueue({ type: 'finish', finishReason: TOOL_CALLS, usage: ZERO_USAGE });
          controller.close();
          return;
        }

        controller.enqueue({ type: 'text-start', id });
        for (const chunk of tokenize(step.text)) {
          controller.enqueue({ type: 'text-delta', id, delta: chunk });
          await delay(12);
        }
        controller.enqueue({ type: 'text-end', id });
        controller.enqueue({ type: 'finish', finishReason: STOP, usage: ZERO_USAGE });
        controller.close();
      },
    });

    return { stream };
  }

  private nextId(): string {
    this.sequence += 1;
    return `demo-${this.sequence}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private plan(options: LanguageModelV4CallOptions): ScriptedStep {
    const availableTools = new Set(
      (options.tools ?? []).map((definition) => definition.name).filter(Boolean),
    );
    return planStep(this.agent, options.prompt, availableTools);
  }
}

/**
 * One parser per desk. A lookup rather than a chain of conditionals: adding a
 * fifth agent without a scripted parser should be a type error here, not a
 * silent fall-through to whichever desk the last `else` happened to name.
 */
const INTENTS: Record<AgentId, (text: string) => ToolCallStep | null> = {
  fitness: fitnessIntent,
  work: workIntent,
  finance: financeIntent,
  learning: learningIntent,
};

/** Exported for tests: the whole scripting decision, with no I/O. */
export function planStep(
  agent: AgentId,
  prompt: LanguageModelV4Prompt,
  availableTools: Set<string>,
): ScriptedStep {
  const toolResult = lastToolResult(prompt);
  if (toolResult) return { type: 'text', text: narrateToolResult(agent, toolResult) };

  const text = lastUserText(prompt);
  const intent = INTENTS[agent](text);

  if (intent !== null && availableTools.has(intent.toolName)) return intent;
  return { type: 'text', text: fallbackReply(agent, text) };
}

export function lastUserText(prompt: LanguageModelV4Prompt): string {
  for (let index = prompt.length - 1; index >= 0; index -= 1) {
    const message = prompt[index];
    if (message.role !== 'user') continue;
    return message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
  }
  return '';
}

function lastToolResult(prompt: LanguageModelV4Prompt): Record<string, unknown> | null {
  const last = prompt[prompt.length - 1];
  if (!last || last.role !== 'tool') return null;
  for (const part of last.content) {
    if (part.type !== 'tool-result') continue;
    const output = part.output;
    if (output.type === 'json' || output.type === 'error-json') {
      return output.value as Record<string, unknown>;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Intent scripting
// ---------------------------------------------------------------------------

const LOG_PATTERN =
  /(?<exercise>[a-z][a-z\s]*?)\s*(?<sets>\d+)\s*[x×]\s*(?<reps>\d+)\s*(?:@|at)?\s*(?<weight>\d+(?:\.\d+)?)\s*kg/i;

export function fitnessIntent(text: string): ToolCallStep | null {
  const normalized = text.toLowerCase();

  const logged = LOG_PATTERN.exec(text);
  if (logged?.groups) {
    const rpe = /rpe\s*(\d+(?:\.\d+)?)/i.exec(text);
    return {
      type: 'tool-call',
      toolName: 'log_workout',
      input: {
        exercise: titleCase(cleanExercise(logged.groups.exercise)),
        sets: Number(logged.groups.sets),
        reps: Number(logged.groups.reps),
        weight: Number(logged.groups.weight),
        rpe: rpe ? Number(rpe[1]) : null,
        notes: null,
        date: null,
      },
    };
  }

  if (/macro|calorie|protein|intake|eat/.test(normalized)) {
    const weight = /(\d{2,3}(?:\.\d+)?)\s*kg/.exec(normalized);
    return {
      type: 'tool-call',
      toolName: 'calculate_macros',
      input: {
        bodyweightKg: weight ? Number(weight[1]) : 75,
        activity: /sedentary|desk/.test(normalized)
          ? 'sedentary'
          : /very active|high/.test(normalized)
            ? 'high'
            : 'moderate',
        goal: /cut|lean|deficit/.test(normalized)
          ? 'cut'
          : /bulk|gain|surplus/.test(normalized)
            ? 'bulk'
            : 'maintain',
      },
    };
  }

  if (/trend|progress|volume|stall|plateau|stuck|history|last \d+ week/.test(normalized)) {
    return {
      type: 'tool-call',
      toolName: 'get_progress_summary',
      input: {
        exercise: guessExercise(normalized) ?? 'Bench Press',
        rangeDays: /(\d+)\s*week/.exec(normalized)
          ? Number(/(\d+)\s*week/.exec(normalized)![1]) * 7
          : 42,
      },
    };
  }

  return null;
}

export function workIntent(text: string): ToolCallStep | null {
  const normalized = text.toLowerCase();

  if (/^(add|create|new) task|add task|remind me to|capture/.test(normalized)) {
    return {
      type: 'tool-call',
      toolName: 'create_task',
      input: {
        title: extractTaskTitle(text),
        priority: /high|urgent|asap/.test(normalized)
          ? 'high'
          : /low priority|whenever/.test(normalized)
            ? 'low'
            : 'medium',
        status: 'todo',
        dueDate: null,
        project: null,
      },
    };
  }

  if (/summar/.test(normalized) && /note|week|meeting|call/.test(normalized)) {
    const days = /(\d+)\s*day/.exec(normalized);
    return {
      type: 'tool-call',
      toolName: 'summarize_notes',
      input: { rangeDays: days ? Number(days[1]) : 7 },
    };
  }

  if (/slip|overdue|open|status|list|show|what.s left|blocked|priorit/.test(normalized)) {
    return {
      type: 'tool-call',
      toolName: 'list_tasks',
      input: {
        status: /blocked/.test(normalized)
          ? 'blocked'
          : /in progress|doing/.test(normalized)
            ? 'doing'
            : null,
        priority: /high priority|urgent/.test(normalized) ? 'high' : null,
        project: null,
      },
    };
  }

  return null;
}

export function financeIntent(text: string): ToolCallStep | null {
  const normalized = text.toLowerCase();

  // Past tense with an amount is a capture; anything else about money is a
  // question. "spent 840 at BigBasket" logs, "how much do I spend" reads.
  const logged = /(?:spent|paid|bought|cost)\D{0,12}(\d[\d,]*(?:\.\d+)?)/.exec(normalized);
  if (logged) {
    return {
      type: 'tool-call',
      toolName: 'log_expense',
      input: {
        merchant: extractMerchant(text) ?? 'Unknown',
        amount: Number(logged[1].replace(/,/g, '')),
        category: guessCategory(normalized),
        note: null,
        date: null,
      },
    };
  }

  // `under|over|within|left` catch a budget question phrased without the word
  // "budget" — "am I under 20000 this month?" is how people actually ask.
  if (
    /spend|spent|budget|total|summar|breakdown|how much|burn|categor|under|over|within|left/.test(
      normalized,
    )
  ) {
    const days = /(\d+)\s*day/.exec(normalized);
    const months = /(\d+)\s*month/.exec(normalized);
    const budget = /(?:budget|under|below|within)\D{0,8}(\d[\d,]*)/.exec(normalized);
    return {
      type: 'tool-call',
      toolName: 'get_spending_summary',
      input: {
        rangeDays: days ? Number(days[1]) : months ? Number(months[1]) * 30 : 30,
        category: CATEGORY_CUES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null,
        budget: budget ? Number(budget[1].replace(/,/g, '')) : null,
      },
    };
  }

  return null;
}

export function learningIntent(text: string): ToolCallStep | null {
  const normalized = text.toLowerCase();

  // `finish_reading` needs an id that only `list_reading` can supply, so the
  // scripted path reads the queue rather than inventing one.
  if (/^(i )?(just )?finished|done with|completed reading/.test(normalized)) {
    return { type: 'tool-call', toolName: 'list_reading', input: { status: null, topic: null } };
  }

  if (/^(add|queue|put)\b|to my queue|want to read|reading list|start reading/.test(normalized)) {
    return {
      type: 'tool-call',
      toolName: 'add_reading',
      input: {
        title: extractReadingTitle(text),
        kind: /paper|arxiv/.test(normalized)
          ? 'paper'
          : /book/.test(normalized)
            ? 'book'
            : /course/.test(normalized)
              ? 'course'
              : /video|talk|lecture/.test(normalized)
                ? 'video'
                : 'article',
        status: /start reading|reading now/.test(normalized) ? 'reading' : 'queued',
        topic: null,
      },
    };
  }

  if (/queue|queued|read|learn|takeaway|stale|list|study|what.s left/.test(normalized)) {
    return {
      type: 'tool-call',
      toolName: 'list_reading',
      input: {
        status: /queued|still/.test(normalized)
          ? 'queued'
          : /finished|learned/.test(normalized)
            ? 'finished'
            : null,
        topic: null,
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------

function narrateToolResult(agent: AgentId, result: Record<string, unknown>): string {
  const kind = typeof result.kind === 'string' ? result.kind : '';

  switch (kind) {
    case 'workout-logged': {
      const workout = result.workout as { exercise: string; weight: number } | undefined;
      return `Logged. ${workout?.exercise ?? 'Set'} at ${workout?.weight ?? '?'}kg is in the book. ${
        typeof result.note === 'string' ? result.note : ''
      }`.trim();
    }
    case 'progress-summary': {
      const sessions = Number(result.sessions ?? 0);
      const trend = Number(result.trendPct ?? 0);
      const verdict = String(result.verdict ?? 'insufficient-data');
      if (sessions === 0)
        return `Nothing logged for ${String(result.exercise)} in that window. Log a session and ask again.`;
      if (verdict === 'insufficient-data') {
        return `${sessions} session${sessions === 1 ? '' : 's'} logged — not enough to call a trend yet. Give it two more.`;
      }
      if (verdict === 'stalled') {
        return `${sessions} sessions, volume flat at ${trend > 0 ? '+' : ''}${trend}%. That is a stall, not a bad week. Drop to 90% of top load for one session, then rebuild in 2.5kg steps.`;
      }
      if (verdict === 'regressing') {
        return `${sessions} sessions, volume down ${Math.abs(trend)}%. Check sleep and intake before touching the programme — the load is not the problem yet.`;
      }
      return `${sessions} sessions, volume up ${trend}%. Keep the current progression, top load is ${String(result.bestWeight)}kg.`;
    }
    case 'macros':
      return `${String(result.calories)} kcal — ${String(result.proteinG)}g protein, ${String(
        result.carbsG,
      )}g carbs, ${String(result.fatG)}g fat. Hit protein first, the rest is flexible.`;
    case 'task-created': {
      const task = result.task as { title: string; priority: string } | undefined;
      return `Captured: "${task?.title ?? 'task'}" at ${task?.priority ?? 'medium'} priority.`;
    }
    case 'task-list': {
      const tasks = Array.isArray(result.tasks) ? result.tasks : [];
      const slipping = Array.isArray(result.slipping) ? (result.slipping as string[]) : [];
      if (tasks.length === 0) return 'Nothing matches that filter. Clean board.';
      const head =
        slipping.length > 0
          ? `${slipping.length} slipping: ${slipping.join(', ')}.`
          : 'Nothing overdue.';
      return `${head} ${tasks.length} item${tasks.length === 1 ? '' : 's'} on the board — the card below has the full state.`;
    }
    case 'task-updated': {
      const task = result.task as { title: string; status: string } | null | undefined;
      return task
        ? `Moved "${task.title}" to ${task.status}.`
        : `No task with id ${String(result.requestedId)}. Run list_tasks first to get the id.`;
    }
    case 'notes-summary': {
      const count = Number(result.noteCount ?? 0);
      if (count === 0) return 'No notes in that window.';
      const sources = Array.isArray(result.sources) ? (result.sources as string[]).join(', ') : '';
      return `${count} note${count === 1 ? '' : 's'} across ${sources}. Excerpts are in the card below — the recurring theme is shipping Cannon before the case study goes out.`;
    }
    case 'expense-logged': {
      const expense = result.expense as { merchant: string; amount: number } | undefined;
      return `Logged ${expense?.amount ?? '?'} at ${expense?.merchant ?? 'that merchant'}. That puts the last 30 days at ${String(result.monthToDate ?? '?')}.`;
    }
    case 'spending-summary': {
      const entries = Number(result.entries ?? 0);
      if (entries === 0) return 'Nothing logged in that window.';
      const top = (result.categories as { category: string; share: number }[] | undefined)?.[0];
      const used = result.budgetUsedPct;
      return `${String(result.total)} across ${entries} entries, ${String(result.dailyAverage)} a day.${
        top ? ` ${titleCase(top.category)} is the largest share at ${top.share}%.` : ''
      }${typeof used === 'number' ? ` That is ${used}% of the stated budget.` : ''}`;
    }
    case 'reading-added': {
      const item = result.item as { title: string; status: string } | undefined;
      return `Added "${item?.title ?? 'it'}" as ${item?.status ?? 'queued'}. Tell me the takeaway when you finish it — that is the part worth keeping.`;
    }
    case 'reading-list': {
      const counts = result.counts as
        { queued: number; reading: number; finished: number } | undefined;
      const stale = Array.isArray(result.stale) ? (result.stale as string[]) : [];
      if (!counts) return 'Nothing in the queue.';
      return `${counts.reading} in flight, ${counts.queued} queued, ${counts.finished} finished.${
        stale.length > 0
          ? ` ${stale.length} has been queued over a month: ${stale.join(', ')}. Promote it this week or drop it.`
          : ''
      }`;
    }
    case 'reading-updated': {
      const item = result.item as { title: string; takeaway: string | null } | undefined;
      if (!item) {
        return `No reading item with id ${String(result.requestedId)}. Run list_reading first to get the id.`;
      }
      return item.takeaway
        ? `Marked "${item.title}" finished, takeaway stored.`
        : `Marked "${item.title}" finished. No takeaway recorded — what is the one thing worth remembering?`;
    }
    default:
      return DONE_LINE[agent];
  }
}

const DONE_LINE: Record<AgentId, string> = {
  fitness: 'Done. Ask for a trend if you want the numbers behind it.',
  work: 'Done. Ask for the board if you want current state.',
  finance: 'Done. Ask for a summary if you want the totals behind it.',
  learning: 'Done. Ask for the queue if you want current state.',
};

const EXAMPLES: Record<AgentId, string> = {
  fitness:
    'I can log a set ("bench 4x8 @ 72.5kg RPE 8"), pull a trend ("volume on squat over 6 weeks"), or size up intake ("macros for 74kg cutting").',
  work: 'I can capture a task ("add task: ship Cannon, high priority"), read the board ("what\'s slipping?"), or summarise notes ("summarise the last 7 days").',
  finance:
    'I can log a spend ("spent 840 at BigBasket"), total a window ("spend over the last 30 days"), or check a budget ("am I under 20000 this month?").',
  learning:
    'I can queue something ("add the RAG survey paper to my queue"), read the queue ("what\'s still queued?"), or surface takeaways ("what have I learned about embeddings?").',
};

function fallbackReply(agent: AgentId, text: string): string {
  const simulated =
    'Running in simulated inference — no provider key is set on this deployment, so replies are scripted while tools, retrieval and persistence are real.';

  if (text.trim().length === 0) {
    return `${simulated} Ask me something to see the loop run.`;
  }

  return `${simulated} ${EXAMPLES[agent]}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KNOWN_LIFTS = [
  'bench press',
  'bench',
  'back squat',
  'squat',
  'deadlift',
  'overhead press',
  'barbell row',
  'row',
  'pull up',
];

function guessExercise(text: string): string | null {
  const match = KNOWN_LIFTS.find((lift) => text.includes(lift));
  return match ? titleCase(match) : null;
}

function cleanExercise(raw: string): string {
  return raw
    .replace(/^\s*(log|logged|did|today|yesterday|session|i)\b[:\s]*/gi, '')
    .replace(/[^a-z\s]/gi, ' ')
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function extractTaskTitle(text: string): string {
  const cleaned = text
    .replace(/^\s*(add|create|new)\s+task\s*[:\-]?\s*/i, '')
    .replace(/^\s*remind me to\s*/i, '')
    .replace(/,?\s*(high|medium|low)\s+priority.*$/i, '')
    .replace(/,?\s*due\s+.*$/i, '')
    .trim();
  return cleaned.length > 0 ? cleaned : text.trim().slice(0, 120);
}

/** Ordered: the first cue that matches wins, so put the specific ones first. */
const CATEGORY_CUES: [string, RegExp][] = [
  ['subscriptions', /subscription|saas|netflix|spotify|vercel|supabase|plan renewal/],
  ['transport', /uber|ola|cab|taxi|fuel|petrol|metro|train|flight|transport/],
  ['housing', /rent|landlord|maintenance|electricity|water bill|housing/],
  ['health', /gym|pharmacy|doctor|medicine|clinic|health|cult/],
  ['food', /grocer|groceries|bigbasket|swiggy|zomato|restaurant|coffee|lunch|dinner|food/],
  ['shopping', /amazon|flipkart|clothes|shoes|decathlon|shopping|bought/],
];

function guessCategory(text: string): string {
  return CATEGORY_CUES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other';
}

/** "spent 840 at BigBasket on groceries" → "BigBasket". */
function extractMerchant(text: string): string | null {
  const at =
    /\b(?:at|from|to)\s+([A-Za-z][A-Za-z0-9'&.\- ]{1,40}?)(?=\s+(?:on|for|because)\b|[,.]|$)/i.exec(
      text,
    );
  const merchant = at?.[1]?.trim();
  if (!merchant || merchant.length === 0) return null;
  // Only case a name the user typed entirely in lower case. Title-casing
  // everything turns "BigBasket" into "Bigbasket", and the merchant is their
  // text, not ours.
  return /[A-Z]/.test(merchant) ? merchant : titleCase(merchant);
}

function extractReadingTitle(text: string): string {
  const quoted = /["“']([^"”']{2,200})["”']/.exec(text);
  if (quoted) return quoted[1].trim();

  const cleaned = text
    .replace(/^\s*(add|queue|put)\s+/i, '')
    .replace(/^\s*(the|a|an)\s+/i, '')
    .replace(/\s+(to|on|in)\s+(my\s+)?(reading\s+)?(queue|list).*$/i, '')
    .replace(/^\s*i\s+want\s+to\s+read\s*/i, '')
    .replace(/^\s*start reading\s*/i, '')
    .trim();

  return cleaned.length > 0 ? cleaned : text.trim().slice(0, 200);
}

function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
