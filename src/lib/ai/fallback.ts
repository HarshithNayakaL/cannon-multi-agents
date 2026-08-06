import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';

export type FallbackEvent = {
  from: string;
  to: string;
  stage: 'connect' | 'stream';
  error: unknown;
};

export type FallbackOptions = {
  modelId?: string;
  onFallback?: (event: FallbackEvent) => void;
};

/**
 * Provider fallback as a model, not as a try/catch at the call site.
 *
 * Wrapping the provider interface means `streamText`, tool execution and the
 * UI stream protocol are all unaware that a swap happened — the only thing
 * that changes is which upstream produced the tokens. Two failure modes are
 * covered: the call never connects, and the call connects but errors before
 * emitting any content. Once real content is flowing a mid-stream failure is
 * surfaced rather than silently restarted, because re-running a partially
 * executed tool chain is worse than a visible error.
 */
export function createFallbackModel(
  models: LanguageModelV4[],
  options: FallbackOptions = {},
): LanguageModelV4 {
  if (models.length === 0) throw new Error('createFallbackModel requires at least one model');
  const [primary] = models;

  return {
    specificationVersion: 'v4',
    provider: models.map((model) => model.provider).join('>'),
    modelId: options.modelId ?? primary.modelId,
    supportedUrls: primary.supportedUrls,

    async doGenerate(
      callOptions: LanguageModelV4CallOptions,
    ): Promise<LanguageModelV4GenerateResult> {
      let lastError: unknown;
      for (let index = 0; index < models.length; index += 1) {
        try {
          return await models[index].doGenerate(callOptions);
        } catch (error) {
          lastError = error;
          const next = models[index + 1];
          if (!next) break;
          options.onFallback?.({
            from: models[index].provider,
            to: next.provider,
            stage: 'connect',
            error,
          });
        }
      }
      throw lastError;
    },

    async doStream(callOptions: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      let lastError: unknown;

      for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        const next = models[index + 1];

        try {
          const result = await model.doStream(callOptions);
          const probed = await probeStream(result.stream);

          if (probed.failedEarly && next) {
            options.onFallback?.({
              from: model.provider,
              to: next.provider,
              stage: 'stream',
              error: probed.error,
            });
            lastError = probed.error;
            continue;
          }

          return { ...result, stream: probed.stream };
        } catch (error) {
          lastError = error;
          if (!next) break;
          options.onFallback?.({
            from: model.provider,
            to: next.provider,
            stage: 'connect',
            error,
          });
        }
      }

      throw lastError ?? new Error('All configured inference providers failed');
    },
  };
}

type ProbeResult = {
  stream: ReadableStream<LanguageModelV4StreamPart>;
  failedEarly: boolean;
  error?: unknown;
};

/** Parts that carry no commitment — safe to buffer and replay onto another provider. */
const PREAMBLE_TYPES = new Set(['stream-start', 'response-metadata']);

/**
 * Reads until the first meaningful part. If that part is an error, the stream
 * is discarded as unusable; otherwise the buffered head is replayed in front
 * of the untouched tail.
 */
async function probeStream(
  source: ReadableStream<LanguageModelV4StreamPart>,
): Promise<ProbeResult> {
  const reader = source.getReader();
  const buffered: LanguageModelV4StreamPart[] = [];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value.type === 'error') {
        reader.releaseLock();
        await source.cancel().catch(() => undefined);
        return { stream: source, failedEarly: true, error: value.error };
      }

      buffered.push(value);
      if (!PREAMBLE_TYPES.has(value.type)) break;
    }
  } catch (error) {
    reader.releaseLock();
    return { stream: source, failedEarly: true, error };
  }

  const stream = new ReadableStream<LanguageModelV4StreamPart>({
    async start(controller) {
      for (const part of buffered) controller.enqueue(part);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return { stream, failedEarly: false };
}
