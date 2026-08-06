import type {
  LanguageModelV4,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';

import { createFallbackModel } from '@/lib/ai/fallback';

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const STOP: LanguageModelV4FinishReason = { unified: 'stop', raw: 'stop' };

function stubModel(
  provider: string,
  behaviour: 'ok' | 'throw' | 'error-part' | 'mid-stream-error',
  text = provider,
): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider,
    modelId: `${provider}-model`,
    supportedUrls: {},
    async doGenerate() {
      if (behaviour === 'throw') throw new Error(`${provider} refused`);
      return { content: [{ type: 'text', text }], finishReason: STOP, usage: USAGE, warnings: [] };
    },
    async doStream() {
      if (behaviour === 'throw') throw new Error(`${provider} refused`);

      const parts: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];

      if (behaviour === 'error-part') {
        parts.push({ type: 'error', error: new Error(`${provider} exploded`) });
      } else {
        parts.push({ type: 'text-start', id: '1' });
        parts.push({ type: 'text-delta', id: '1', delta: text });
        if (behaviour === 'mid-stream-error') {
          parts.push({ type: 'error', error: new Error(`${provider} died mid-stream`) });
        }
        parts.push({ type: 'text-end', id: '1' });
        parts.push({ type: 'finish', finishReason: STOP, usage: USAGE });
      }

      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
}

async function collect(stream: ReadableStream<LanguageModelV4StreamPart>) {
  const parts: LanguageModelV4StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

function textOf(parts: LanguageModelV4StreamPart[]): string {
  return parts
    .filter(
      (part): part is Extract<LanguageModelV4StreamPart, { type: 'text-delta' }> =>
        part.type === 'text-delta',
    )
    .map((part) => part.delta)
    .join('');
}

describe('createFallbackModel', () => {
  it('refuses to build an empty chain', () => {
    expect(() => createFallbackModel([])).toThrow();
  });

  it('uses the primary when it works, and never touches the fallback', async () => {
    const secondary = stubModel('gemini', 'ok');
    const spy = vi.spyOn(secondary, 'doStream');
    const model = createFallbackModel([stubModel('groq', 'ok'), secondary]);

    const { stream } = await model.doStream(callOptions());
    expect(textOf(await collect(stream))).toBe('groq');
    expect(spy).not.toHaveBeenCalled();
  });

  it('falls back when the primary never connects', async () => {
    const onFallback = vi.fn();
    const model = createFallbackModel([stubModel('groq', 'throw'), stubModel('gemini', 'ok')], {
      onFallback,
    });

    const { stream } = await model.doStream(callOptions());
    expect(textOf(await collect(stream))).toBe('gemini');
    expect(onFallback).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'groq', to: 'gemini', stage: 'connect' }),
    );
  });

  it('falls back when the primary connects but errors before any content', async () => {
    const onFallback = vi.fn();
    const model = createFallbackModel(
      [stubModel('groq', 'error-part'), stubModel('gemini', 'ok')],
      { onFallback },
    );

    const { stream } = await model.doStream(callOptions());
    expect(textOf(await collect(stream))).toBe('gemini');
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({ stage: 'stream' }));
  });

  it('surfaces a mid-stream failure rather than silently replaying a partial answer', async () => {
    const onFallback = vi.fn();
    const model = createFallbackModel(
      [stubModel('groq', 'mid-stream-error'), stubModel('gemini', 'ok')],
      { onFallback },
    );

    const parts = await collect((await model.doStream(callOptions())).stream);
    expect(textOf(parts)).toBe('groq');
    expect(parts.some((part) => part.type === 'error')).toBe(true);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('replays the buffered preamble in front of the tail', async () => {
    const model = createFallbackModel([stubModel('groq', 'ok')]);
    const parts = await collect((await model.doStream(callOptions())).stream);
    expect(parts[0].type).toBe('stream-start');
    expect(parts.at(-1)?.type).toBe('finish');
  });

  it('throws the last error when every provider fails', async () => {
    const model = createFallbackModel([stubModel('groq', 'throw'), stubModel('gemini', 'throw')]);
    await expect(model.doStream(callOptions())).rejects.toThrow('gemini refused');
  });

  it('falls back for non-streaming generation too', async () => {
    const model = createFallbackModel([stubModel('groq', 'throw'), stubModel('gemini', 'ok')]);
    const result = await model.doGenerate(callOptions());
    expect(result.content).toEqual([{ type: 'text', text: 'gemini' }]);
  });

  it('advertises the whole chain as its provider name', () => {
    const model = createFallbackModel([stubModel('groq', 'ok'), stubModel('gemini', 'ok')]);
    expect(model.provider).toBe('groq>gemini');
    expect(model.modelId).toBe('groq-model');
  });
});

function callOptions() {
  return { prompt: [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }] };
}
