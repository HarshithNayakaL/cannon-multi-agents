import { describe, expect, it } from 'vitest';
import type { TextStreamPart, ToolSet } from 'ai';

import { createLeakGuardTransform, stripLeakedToolSyntax } from '@/lib/ai/leak-guard';

describe('stripLeakedToolSyntax', () => {
  it('removes a complete leaked call and the blank line it leaves behind', () => {
    const text =
      'Focus on braking points and racing line.\n<function=remember>{"title":"Goals","body":"Work on braking."}</function>';
    expect(stripLeakedToolSyntax(text)).toBe('Focus on braking points and racing line.');
  });

  it('removes more than one leaked call in the same response', () => {
    const text = 'a<function=one>{}</function>b<function=two>{"x":1}</function>c';
    expect(stripLeakedToolSyntax(text)).toBe('abc');
  });

  it('leaves ordinary text with a bare angle bracket untouched', () => {
    expect(stripLeakedToolSyntax('is 1 < 2 and 3 > 2')).toBe('is 1 < 2 and 3 > 2');
  });

  it('has nothing to do when the response never leaked', () => {
    expect(stripLeakedToolSyntax('A perfectly normal answer.')).toBe('A perfectly normal answer.');
  });
});

// The stream-level guard is exercised directly, feeding it the same
// `TextStreamPart` shapes `streamText` would — this is what the AI SDK's own
// `experimental_transform` pipeline sees, so testing at this level covers the
// actual failure mode rather than a simulation of it.
async function run(parts: TextStreamPart<ToolSet>[]): Promise<TextStreamPart<ToolSet>[]> {
  const transform = createLeakGuardTransform<ToolSet>()({ tools: {}, stopStream: () => {} });
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();

  const out: TextStreamPart<ToolSet>[] = [];
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.push(value);
    }
  })();

  for (const part of parts) await writer.write(part);
  await writer.close();
  await pump;
  return out;
}

function textOf(parts: TextStreamPart<ToolSet>[]): string {
  return parts
    .filter(
      (part): part is Extract<TextStreamPart<ToolSet>, { type: 'text-delta' }> =>
        part.type === 'text-delta',
    )
    .map((part) => part.text)
    .join('');
}

describe('createLeakGuardTransform', () => {
  it('passes ordinary streamed text straight through', async () => {
    const out = await run([
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', text: 'Focus on ' },
      { type: 'text-delta', id: '1', text: 'braking points.' },
      { type: 'text-end', id: '1' },
    ]);
    expect(textOf(out)).toBe('Focus on braking points.');
    expect(out.map((part) => part.type)).toEqual([
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
    ]);
  });

  it('drops a leak that arrives in a single delta', async () => {
    const out = await run([
      { type: 'text-start', id: '1' },
      {
        type: 'text-delta',
        id: '1',
        text: 'Good answer.\n<function=remember>{"title":"x"}</function>',
      },
      { type: 'text-end', id: '1' },
    ]);
    // The trailing newline that preceded the tag survives — it arrived in the
    // same delta as the leak, before the whole tag was confirmed, so it was
    // never actually emitted separately; the guard trims what it can inspect
    // before returning. Renders as no visible extra line in the message
    // bubble either way.
    expect(textOf(out)).toBe('Good answer.\n');
  });

  // The exact failure mode from the bug report: the tag arrives split across
  // several small deltas, the way a real token-by-token stream would send it.
  it('drops a leak that arrives split across many small deltas', async () => {
    const chunks = [
      'Focus on braking points, acceleration, and racing line consistency.\n',
      '<function',
      '=remember>{"title":"Suzuka Improvement Goals","body":"Work on braking ',
      'points, acceleration, and racing line consistency.","tags":["Aston Martin GT3"',
      ',"Suzuka","lap_time"]}',
      '</function>',
    ];
    const out = await run([
      { type: 'text-start', id: '1' },
      ...chunks.map((text) => ({ type: 'text-delta' as const, id: '1', text })),
      { type: 'text-end', id: '1' },
    ]);
    // The plain-text chunk (with its trailing newline) is emitted as its own
    // delta before the tag has even arrived, so by the time the leak is
    // recognised there is nothing left to retroactively trim — only the leak
    // itself, which is exactly the bug from the report and is fully gone.
    expect(textOf(out)).toBe(
      'Focus on braking points, acceleration, and racing line consistency.\n',
    );
  });

  it('drops a leak even when the closing tag lands in its own delta', async () => {
    const out = await run([
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', text: 'Done. <function=remember>{"a":1}' },
      { type: 'text-delta', id: '1', text: '</function>' },
      { type: 'text-end', id: '1' },
    ]);
    // The one trailing space before the stripped tag is invisible once
    // rendered as prose — not worth buffering further to trim.
    expect(textOf(out)).toBe('Done. ');
  });

  it('emits text that follows a leak, once the leak itself resolves', async () => {
    const out = await run([
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', text: 'Before. <function=x>{}</function> After.' },
      { type: 'text-end', id: '1' },
    ]);
    expect(textOf(out)).toBe('Before.  After.');
  });

  it('drops a truncated leak that never closes before the stream ends', async () => {
    const out = await run([
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', text: 'Answer. <function=remember>{"title":"cut off' },
      { type: 'text-end', id: '1' },
    ]);
    expect(textOf(out)).toBe('Answer. ');
  });

  it('does not hold an innocent angle bracket that never becomes a tag', async () => {
    const out = await run([
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', text: 'is 1 < 2 and ' },
      { type: 'text-delta', id: '1', text: '3 > 2' },
      { type: 'text-end', id: '1' },
    ]);
    expect(textOf(out)).toBe('is 1 < 2 and 3 > 2');
  });

  it('guards each text block independently across a multi-step response', async () => {
    const out = await run([
      { type: 'text-start', id: 'a' },
      { type: 'text-delta', id: 'a', text: 'Step one.' },
      { type: 'text-end', id: 'a' },
      { type: 'text-start', id: 'b' },
      { type: 'text-delta', id: 'b', text: 'Step two. <function=x>{}</function> clean.' },
      { type: 'text-end', id: 'b' },
    ]);
    expect(textOf(out)).toBe('Step one.Step two.  clean.');
  });

  it('passes tool-call and other non-text parts through untouched', async () => {
    const toolCall = {
      type: 'tool-call',
      toolCallId: '1',
      toolName: 'recall',
      input: {},
    } as unknown as TextStreamPart<ToolSet>;
    const out = await run([toolCall]);
    expect(out).toEqual([toolCall]);
  });
});
