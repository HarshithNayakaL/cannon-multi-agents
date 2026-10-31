import type { ModelInfo } from '@/lib/ai/catalog';

/**
 * "New" means the provider lists it live but the catalog has no notes on it
 * yet; "Preview" means the provider itself says it may be withdrawn at short
 * notice. Both are reasons to think before pinning, so both are said out loud.
 */
export function ModelBadges({ model }: { model: ModelInfo }) {
  return (
    <>
      {model.isNew ? (
        <span
          className="badge"
          style={{
            color: 'var(--good)',
            borderColor: 'color-mix(in oklab, var(--good) 40%, transparent)',
          }}
        >
          New
        </span>
      ) : null}
      {model.preview ? <span className="badge">Preview</span> : null}
    </>
  );
}
