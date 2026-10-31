'use client';

import { Check, ChevronDown, Zap } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { ModelBadges } from '@/components/chat/model-badges';
import { PROVIDERS, formatContext, type ModelInfo } from '@/lib/ai/catalog';

/**
 * Which model answers the next turn.
 *
 * "Auto" is the default and is not a cop-out: it runs the configured fallback
 * chain, so a provider outage degrades to the next vendor instead of failing.
 * Pinning a model puts it at the front of that chain rather than replacing it,
 * which is why choosing one never costs you the fallback.
 *
 * Every entry states throughput and context window, because those are the two
 * numbers that actually decide the pick.
 */
export function ModelPicker({
  models,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  models: ModelInfo[];
  /** `undefined` means auto — run the configured chain. */
  value: string | undefined;
  onChange: (key: string | undefined) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // `createPortal` needs document, which does not exist during SSR.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const selected = value ? models.find((model) => model.key === value) : undefined;
  const simulated = models.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        disabled={simulated}
        aria-expanded={open}
        aria-label="Choose the model for this agent"
        className="btn btn-quiet h-11 min-h-0 max-w-[9.5rem] gap-1.5 !px-3 text-[0.8125rem] sm:max-w-[11rem] pointer-fine:h-9"
        data-testid="model-picker"
      >
        <span className="truncate">{simulated ? 'simulated' : (selected?.name ?? 'Auto')}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Models">
              <button
                type="button"
                aria-label="Close model picker"
                onClick={() => onOpenChange(false)}
                className="fade absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.55)' }}
              />

              {/* Bottom sheet at every width. A popover anchored to a header
                  button would need collision handling against the inspector
                  and the tab bar for no gain over a sheet. */}
              <div
                className="sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[82dvh] w-full max-w-[38rem] flex-col overflow-hidden rounded-t-[var(--r-xl)] border-t sm:bottom-6 sm:rounded-[var(--r-xl)] sm:border"
                style={{
                  background: 'var(--bg-panel)',
                  borderColor: 'var(--line-strong)',
                  boxShadow: 'var(--e-3)',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                }}
              >
                <header className="border-b px-5 py-4" style={{ borderColor: 'var(--line)' }}>
                  <h2 className="t-subtitle">Model</h2>
                  <p className="t-label mt-0.5">
                    A pick moves to the front of the fallback chain. It does not replace it.
                  </p>
                </header>

                <div className="scroll flex-1 overflow-y-auto p-3">
                  <ModelOption
                    title="Auto"
                    detail="Groq first, Gemini behind it. Recommended."
                    selected={value === undefined}
                    onSelect={() => {
                      onChange(undefined);
                      onOpenChange(false);
                    }}
                  />

                  {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((providerId) => {
                    const provider = PROVIDERS[providerId];
                    const owned = models.filter((model) => model.provider === providerId);
                    if (owned.length === 0) return null;

                    return (
                      <section key={providerId} className="mt-4">
                        <div className="mb-1.5 flex items-center gap-2 px-2">
                          <span
                            className="dot"
                            style={{ background: provider.accent }}
                            aria-hidden="true"
                          />
                          <h3 className="t-label" style={{ color: 'var(--ink-2)' }}>
                            {provider.name}
                          </h3>
                          <span className="t-label truncate">{provider.blurb}</span>
                        </div>

                        {owned.map((model) => (
                          <ModelOption
                            key={model.key}
                            title={model.name}
                            detail={model.strength}
                            meta={
                              <>
                                <ModelBadges model={model} />
                                {model.speed ? (
                                  <span className="mono inline-flex items-center gap-1">
                                    <Zap className="size-3" aria-hidden="true" />
                                    {model.speed} tok/s
                                  </span>
                                ) : null}
                                <span className="mono">
                                  {formatContext(model.contextTokens)} ctx
                                </span>
                              </>
                            }
                            selected={value === model.key}
                            onSelect={() => {
                              onChange(model.key);
                              onOpenChange(false);
                            }}
                          />
                        ))}
                      </section>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ModelOption({
  title,
  detail,
  meta,
  selected,
  onSelect,
}: {
  title: string;
  detail: string;
  meta?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="lift flex w-full items-start gap-3 rounded-[var(--r-md)] px-3 py-3 text-left"
      style={selected ? { background: 'var(--accent-soft)' } : undefined}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className="text-[0.9375rem] font-medium"
            style={{ color: selected ? 'var(--accent)' : 'var(--ink)' }}
          >
            {title}
          </span>
          {meta ? (
            <span className="flex flex-wrap items-center gap-x-2" style={{ color: 'var(--ink-3)' }}>
              {meta}
            </span>
          ) : null}
        </span>
        <span className="t-label mt-0.5 block">{detail}</span>
      </span>

      {selected ? (
        <Check className="mt-1 size-4 shrink-0" style={{ color: 'var(--accent)' }} />
      ) : null}
    </button>
  );
}
