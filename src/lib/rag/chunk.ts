/**
 * Semantic chunking.
 *
 * Cannon's inputs (workout entries, task notes, pasted meeting notes) are
 * already short structured units, so fixed-size windowing would slice through
 * meaning for no benefit. We split on paragraph and bullet boundaries and keep
 * each unit whole; only a unit that blows the size budget is packed into
 * sentences, and only there does fragment-stitching apply.
 */

const MAX_CHUNK_CHARS = 900;
const MIN_FRAGMENT_CHARS = 24;

export function semanticChunks(input: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
  const normalized = input.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) return [];

  const units = normalized
    .split(/\n{2,}|\n(?=\s*(?:[-*•]|\d+[.)])\s)/g)
    .map((unit) => unit.trim())
    .filter((unit) => unit.length > 0);

  const chunks: string[] = [];
  for (const unit of units) {
    // A natural unit is never merged with its neighbours — a short paragraph
    // is a short paragraph, not a fragment to be glued to the next one.
    if (unit.length <= maxChars) {
      chunks.push(unit);
      continue;
    }
    chunks.push(...packSentences(unit, maxChars));
  }

  return chunks;
}

function packSentences(unit: string, maxChars: number): string[] {
  const sentences = unit.match(/[^.!?\n]+[.!?]*\s*/g) ?? [unit];
  const packed: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length > maxChars) {
      packed.push(current.trim());
      current = '';
    }
    // A single sentence longer than the budget is hard-split rather than dropped.
    if (sentence.length > maxChars) {
      for (let index = 0; index < sentence.length; index += maxChars) {
        packed.push(sentence.slice(index, index + maxChars).trim());
      }
      continue;
    }
    current += sentence;
  }

  if (current.trim().length > 0) packed.push(current.trim());
  return stitchFragments(
    packed.filter((chunk) => chunk.length > 0),
    maxChars,
  );
}

/** Glue a runt left over from packing onto its predecessor, where it belongs. */
function stitchFragments(chunks: string[], maxChars: number): string[] {
  const merged: string[] = [];
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1];
    if (
      previous !== undefined &&
      chunk.length < MIN_FRAGMENT_CHARS &&
      previous.length + chunk.length + 1 <= maxChars
    ) {
      merged[merged.length - 1] = `${previous} ${chunk}`;
      continue;
    }
    merged.push(chunk);
  }
  return merged;
}
