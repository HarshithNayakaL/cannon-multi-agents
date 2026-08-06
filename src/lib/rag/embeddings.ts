import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { embed, embedMany } from 'ai';

import { readEnv } from '@/lib/env';

/**
 * Shared vector width. Gemini is asked to project down to this size via
 * `outputDimensionality` so the local fallback and the hosted model write
 * into the same pgvector column without a migration.
 */
export const EMBEDDING_DIMENSIONS = 768;

export type EmbeddingBackend = 'gemini' | 'local';

export type EmbeddingResult = {
  embeddings: number[][];
  backend: EmbeddingBackend;
};

/**
 * Deterministic hashed bag-of-words embedding.
 *
 * Not a semantic model — it is a lexical one. It keeps retrieval, the schema
 * and the whole RAG path exercisable (and unit-testable) with zero API keys,
 * and it is swapped out the moment a Gemini key is present.
 */
export function localEmbedding(text: string, dimensions: number = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    // Two independent hashes per token reduce collision damage at this width.
    vector[hash(token, 0x1f3d5b79) % dimensions] += 1;
    vector[hash(token, 0x7ed55d16) % dimensions] += 0.5;
  }

  let magnitude = 0;
  for (const value of vector) magnitude += value * value;
  if (magnitude === 0) return vector;

  const norm = Math.sqrt(magnitude);
  return vector.map((value) => value / norm);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((token) => token.length > 1);
}

function hash(value: string, seed: number): number {
  let hashed = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hashed ^= value.charCodeAt(index);
    hashed = Math.imul(hashed, 0x01000193) >>> 0;
  }
  return hashed >>> 0;
}

export async function embedTexts(texts: string[]): Promise<EmbeddingResult> {
  if (texts.length === 0) return { embeddings: [], backend: activeBackend() };

  const env = readEnv();
  if (!env.googleApiKey) {
    return { embeddings: texts.map((text) => localEmbedding(text)), backend: 'local' };
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey: env.googleApiKey });
    if (texts.length === 1) {
      const { embedding } = await embed({
        model: google.textEmbeddingModel(env.embeddingModel),
        value: texts[0],
        providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS } },
      });
      return { embeddings: [embedding], backend: 'gemini' };
    }
    const { embeddings } = await embedMany({
      model: google.textEmbeddingModel(env.embeddingModel),
      values: texts,
      providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS } },
    });
    return { embeddings, backend: 'gemini' };
  } catch {
    // Embedding is a supporting path, never the reason a chat request fails.
    return { embeddings: texts.map((text) => localEmbedding(text)), backend: 'local' };
  }
}

export async function embedText(
  text: string,
): Promise<{ embedding: number[]; backend: EmbeddingBackend }> {
  const { embeddings, backend } = await embedTexts([text]);
  return { embedding: embeddings[0] ?? localEmbedding(text), backend };
}

export function activeBackend(): EmbeddingBackend {
  return readEnv().googleApiKey ? 'gemini' : 'local';
}
