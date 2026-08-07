import { generateObject } from 'ai';
import { z } from 'zod';

import { isReservedAgentId, toSlug, type CustomAgentInput } from '@/lib/agents/types';
import { resolveModel } from '@/lib/ai/provider';

/**
 * Turning "I need something to track my houseplants" into a working agent.
 *
 * The model writes the persona, because that is genuinely a language task: a
 * good system prompt for a domain needs to know what that domain's jargon,
 * failure modes and tone are, and no amount of string manipulation gets there.
 *
 * Everything structural is decided here rather than by the model: the slug,
 * the accent, the uniqueness check, the length caps. A generated field that
 * becomes a URL or a database key is an injection surface, and "trust the
 * model to emit a valid slug" is not a validation strategy.
 */

const SPEC = z.object({
  name: z.string().min(2).max(18).describe('One or two words. Appears in the nav rail.'),
  title: z
    .string()
    .min(3)
    .max(40)
    .describe('The role, e.g. "Garden Agent". Appears in the header.'),
  tagline: z
    .string()
    .min(10)
    .max(90)
    .describe('Three comma-separated capabilities, no trailing full stop.'),
  systemPrompt: z
    .string()
    .min(120)
    .max(2400)
    .describe('The full operating instructions for this agent.'),
  keywords: z
    .array(z.string().min(2).max(30))
    .min(6)
    .max(20)
    .describe('Words a person would actually type when they want this desk.'),
  suggestions: z
    .array(z.string().min(6).max(90))
    .min(3)
    .max(4)
    .describe('Starter prompts written the way the user would type them.'),
});

type Spec = z.infer<typeof SPEC>;

/**
 * Accents are assigned, not generated. A model asked for a hex colour returns
 * whatever it likes, including something unreadable on the dark canvas or
 * indistinguishable from an existing desk. This palette is checked against
 * both themes.
 */
const PALETTE = [
  '#5ac8fa',
  '#ff6482',
  '#66d4cf',
  '#ffd426',
  '#da8fff',
  '#ff8d28',
  '#7d7aff',
  '#68de7a',
] as const;

export function pickAccent(taken: string[]): string {
  const free = PALETTE.filter((colour) => !taken.includes(colour));
  const pool = free.length > 0 ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

const INSTRUCTIONS = `You design specialist agents for Cannon, a personal multi-agent assistant.

The user will describe a domain they want a dedicated agent for. Produce that agent's definition.

The system prompt you write is the agent's whole personality and operating manual. It must:
- State the scope in one line, and state what is out of scope.
- Name the two tools the agent has — \`remember\` (store a titled entry) and \`recall\` (search only this agent's own entries) — and say when to reach for each. The agent has no other tools. Never invent one.
- Tell the agent to call \`recall\` before answering anything about the user's history, rather than guessing from the conversation.
- Tell the agent to say plainly when it has nothing recorded, instead of filling the gap.
- Set a voice. Be specific and opinionated about it — terse, warm, sceptical, whatever suits the domain. "Helpful and friendly" is not a voice.
- Cap replies at roughly six lines unless detail is asked for.

Keywords are the routing vocabulary: the literal words someone types when they want this desk. Include the obvious nouns and verbs of the domain. Do not include generic words like "help" or "please".

Write in British English. Be concrete. No marketing language.`;

/** A deterministic spec, used when no provider key is set. */
export function fallbackSpec(description: string, name: string): Spec {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3);

  const keywords = [...new Set([...words, name.toLowerCase()])].slice(0, 12);

  return {
    name,
    title: `${name} Agent`,
    tagline: `Capture, recall and review anything about ${name.toLowerCase()}`,
    systemPrompt: `You are the ${name} Agent inside Cannon, a personal multi-agent assistant.

SCOPE
${description.trim()}
Anything outside that belongs to another desk. Say so rather than answering it.

TOOLS
- remember: store a titled entry the moment the user states a fact, a decision or an event worth keeping.
- recall: search this desk's own entries. Call it before answering anything about what the user previously said. You have no other tools; never claim otherwise.

DATA
You can only see what has been recorded here. If recall returns nothing, say so plainly rather than filling the gap from memory.

STYLE
Direct and concrete. Lead with the answer. Under six lines unless detail is asked for.`,
    keywords: keywords.length >= 3 ? keywords : [name.toLowerCase()],
    suggestions: [
      `Remember that ${clip(description.trim(), 60)}`,
      'What have I recorded here?',
      'Show me everything tagged important',
    ],
  };
}

export type GenerateResult = {
  agent: CustomAgentInput;
  /** True when the spec came from the deterministic fallback, not a model. */
  simulated: boolean;
};

export type GenerateOptions = {
  /** Slugs already in use, so a collision is resolved rather than overwritten. */
  taken: string[];
  /** Accents already in use, so a new desk does not clash with an existing one. */
  takenAccents: string[];
};

/**
 * Appends -2, -3, … rather than failing. Someone who asks for a second
 * "garden" agent means it, and refusing the request to protect a URL is the
 * wrong trade.
 */
function uniqueSlug(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function generateAgent(
  description: string,
  { taken, takenAccents }: GenerateOptions,
): Promise<GenerateResult> {
  const trimmed = description.trim();
  if (trimmed.length < 3) throw new Error('Describe what the agent is for.');

  const { model, simulated } = resolveModel('dispatch');

  let spec: Spec;
  if (simulated) {
    spec = fallbackSpec(trimmed, defaultName(trimmed));
  } else {
    try {
      const result = await generateObject({
        model,
        schema: SPEC,
        system: INSTRUCTIONS,
        prompt: `Design an agent for: ${trimmed}`,
      });
      spec = result.object;
    } catch (error) {
      // A failed generation must not cost the user their agent. The
      // deterministic spec is worse prose, not a broken agent — same tools,
      // same storage, same retrieval.
      console.error('[cannon] agent generation failed, using the deterministic spec', error);
      spec = fallbackSpec(trimmed, defaultName(trimmed));
    }
  }

  // The slug is derived from the name the model chose, but validated and
  // de-duplicated here. If nothing usable survives, fall back to the raw
  // description, then to a timestamp — creating the agent is what matters.
  const base = toSlug(spec.name) ?? toSlug(trimmed) ?? `agent-${Date.now().toString(36).slice(-6)}`;

  return {
    agent: {
      id: uniqueSlug(isReservedAgentId(base) ? `${base}-desk` : base, taken),
      name: spec.name.trim(),
      title: spec.title.trim(),
      tagline: spec.tagline.trim().replace(/\.$/, ''),
      accent: pickAccent(takenAccents),
      systemPrompt: spec.systemPrompt.trim(),
      keywords: [...new Set(spec.keywords.map((word) => word.trim().toLowerCase()))].filter(
        (word) => word.length > 1,
      ),
      suggestions: spec.suggestions.map((line) => line.trim()),
    },
    simulated,
  };
}

/** Truncates on a word boundary, so a starter prompt never ends mid-word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const boundary = cut.lastIndexOf(' ');
  return `${boundary > max / 2 ? cut.slice(0, boundary) : cut}…`;
}

/** "track my houseplants and when I water them" → "Houseplants". */
export function defaultName(description: string): string {
  const STOP = new Set([
    'a',
    'an',
    'the',
    'my',
    'me',
    'i',
    'for',
    'to',
    'of',
    'and',
    'want',
    'need',
    // Capture verbs, all of them. "log my kiln firings" is a request for a
    // kiln desk, not a desk called Log — and every one of these reads as a
    // plausible noun to a naive first-word scan.
    'track',
    'tracking',
    'log',
    'logging',
    'record',
    'recording',
    'keep',
    'keeping',
    'remember',
    'note',
    'notes',
    'save',
    'monitor',
    'monitoring',
    'manage',
    'managing',
    'organise',
    'organize',
    'plan',
    'planning',
    'help',
    'helps',
    'something',
    'anything',
    'agent',
    'desk',
    'about',
    'with',
    'that',
    'this',
    'when',
    'what',
  ]);

  const word = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .find((candidate) => candidate.length > 2 && !STOP.has(candidate));

  if (!word) return 'Desk';
  return word.charAt(0).toUpperCase() + word.slice(1);
}
