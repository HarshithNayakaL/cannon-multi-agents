import type { StreamTextTransform, TextStreamPart, ToolSet } from 'ai';

/**
 * Groq's Llama models occasionally answer with a second, unauthorised "tool
 * call" written as literal text instead of a real structured one —
 * `<function=name>{"arg":"value"}</function>` — a fallback syntax from
 * Meta's own tool-use format for models not given native function-calling
 * grammar. The AI SDK has no way to recognise it: to the SDK it is
 * indistinguishable from ordinary prose, so it streams straight through to
 * the user and gets persisted to the transcript verbatim. That is what the
 * screenshot in the bug report showed — a real answer, followed by a raw
 * `<function=remember>{...}</function>` tag the user was never meant to see.
 *
 * This transform sits between the raw model stream and everything else in
 * the pipeline — tool execution, `onFinish`, the UI stream — so removing the
 * leaked span here keeps it out of the visible answer and out of what gets
 * saved, for every agent, in one place.
 */

const LEAK_PREFIX = '<function=';
const LEAK_SUFFIX = '</function>';

/**
 * A span that opens with the leak prefix but never closes within this many
 * characters is not a leak — it is ordinary text that happens to start the
 * same way — and gets released rather than held forever.
 */
const MAX_HOLD = 4000;

/** Pure string version, for anything that already has the complete text. */
export function stripLeakedToolSyntax(text: string): string {
  return text
    .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * How much of `text`'s tail could still grow into `pattern` — the length of
 * the longest suffix of `text` that is also a proper prefix of `pattern`.
 *
 * A real token stream delivers the leak prefix in arbitrary pieces —
 * `'<function'` then `'=remember>...'` is exactly what Groq sends. Without
 * this check, `partition` only recognises the prefix once it has already
 * arrived complete in a single delta, which is not how streaming works: a
 * delta ending in `'<function'` (no `=` yet) contains zero occurrences of
 * the literal string `'<function='`, so a plain `indexOf` finds nothing and
 * lets the fragment straight through before the tag has even finished
 * opening.
 */
function trailingPartialMatch(text: string, pattern: string): number {
  const max = Math.min(text.length, pattern.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (text.endsWith(pattern.slice(0, length))) return length;
  }
  return 0;
}

/**
 * Scans a buffer for complete `<function=...>...</function>` spans and
 * removes them, returning what is safe to emit now and what still has to be
 * held because it might be an in-progress leak — either mid-tag, or not yet
 * far enough in to rule the tag out.
 */
function partition(buffer: string): { safe: string; hold: string } {
  let safe = '';
  let rest = buffer;

  for (;;) {
    const start = rest.indexOf(LEAK_PREFIX);

    if (start !== -1) {
      safe += rest.slice(0, start);
      const tail = rest.slice(start);
      const close = tail.indexOf(LEAK_SUFFIX);

      if (close === -1) {
        // Grown past any plausible tag — this was never a leak.
        if (tail.length > MAX_HOLD) {
          safe += tail;
          return { safe, hold: '' };
        }
        return { safe, hold: tail };
      }

      // A complete leak: drop it and keep scanning what follows.
      rest = tail.slice(close + LEAK_SUFFIX.length);
      continue;
    }

    // No complete prefix anywhere. The only thing worth holding is a tail
    // that could still grow into one on the next delta.
    const holdLength = trailingPartialMatch(rest, LEAK_PREFIX);
    safe += rest.slice(0, rest.length - holdLength);
    return { safe, hold: rest.slice(rest.length - holdLength) };
  }
}

/**
 * The stream-level guard. Buffers each text block independently — a single
 * response can stream more than one across its steps — and only emits text
 * once it is known not to be the opening of a leaked tag.
 */
export function createLeakGuardTransform<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  const pending = new Map<string, string>();

  return () =>
    new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === 'text-start') {
          pending.set(part.id, '');
          controller.enqueue(part);
          return;
        }

        if (part.type === 'text-delta') {
          const buffered = (pending.get(part.id) ?? '') + part.text;
          const { safe, hold } = partition(buffered);
          pending.set(part.id, hold);
          if (safe.length > 0) controller.enqueue({ ...part, text: safe });
          return;
        }

        if (part.type === 'text-end') {
          const hold = pending.get(part.id) ?? '';
          pending.delete(part.id);
          // Whatever is still held did not close before the model stopped.
          // If it looks like the start of a leak, it is a truncated one —
          // drop it rather than show a broken tag. Otherwise it was an
          // innocent `<` that never turned into anything, and it is the
          // user's content to see.
          if (hold.length > 0 && !hold.startsWith(LEAK_PREFIX)) {
            controller.enqueue({
              type: 'text-delta',
              id: part.id,
              text: hold,
            } as TextStreamPart<TOOLS>);
          }
          controller.enqueue(part);
          return;
        }

        controller.enqueue(part);
      },
    });
}
