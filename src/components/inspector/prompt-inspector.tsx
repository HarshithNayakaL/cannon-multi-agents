'use client';

import { X } from 'lucide-react';
import { useState } from 'react';

import type { CannonMetadata } from '@/lib/agents/message';
import type { AgentProfile } from '@/lib/agents/registry';

/**
 * Prompt Inspector.
 *
 * Two jobs at once: a genuine debugging aid — the live system prompt, the tool
 * surface, the exact chunks retrieval pulled and their scores — and a visible
 * statement that the prompt is engineered rather than improvised.
 *
 * Everything in here is a machine value, so everything in here is monospace.
 * That is the one place in the product where that is true.
 */
export function PromptInspector({
  profile,
  metadata,
  onClose,
}: {
  profile: AgentProfile;
  metadata?: CannonMetadata;
  onClose?: () => void;
}) {
  const [promptOpen, setPromptOpen] = useState(true);

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex items-center gap-2 border-b px-5 py-4"
        style={{ borderColor: 'var(--line)' }}
      >
        <h2 className="t-label flex-1">Prompt Inspector</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="icon-btn size-7"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </header>

      <div className="scroll flex-1 overflow-y-auto">
        <Section title="Model chain">
          {metadata?.chain?.length ? (
            <ol className="space-y-2">
              {metadata.chain.map((entry, index) => (
                <li key={entry}>
                  <div className="t-label mb-0.5">
                    {index === 0 ? 'primary' : `fallback ${index}`}
                  </div>
                  <code className="mono block break-all" style={{ color: 'var(--ink)' }}>
                    {entry}
                  </code>
                </li>
              ))}
            </ol>
          ) : (
            <Hint>Send a message to see which provider answered.</Hint>
          )}

          {metadata?.fallbacks?.length ? (
            <ul className="mt-2 space-y-1">
              {metadata.fallbacks.map((event, index) => (
                <li key={index} className="mono" style={{ color: 'var(--warn)' }}>
                  {event.from} → {event.to} ({event.stage})
                </li>
              ))}
            </ul>
          ) : null}

          {metadata?.simulated ? (
            <Hint className="mt-2">
              No provider key is set, so inference is simulated. Tools, retrieval and persistence
              are running for real.
            </Hint>
          ) : null}
        </Section>

        <Section
          title="System prompt"
          action={
            <button
              type="button"
              onClick={() => setPromptOpen((open) => !open)}
              aria-expanded={promptOpen}
              className="t-label lift rounded-[var(--r-sm)] px-1"
            >
              {promptOpen ? 'collapse' : 'expand'}
            </button>
          }
        >
          {promptOpen ? (
            <pre
              className="scroll mono max-h-72 overflow-auto rounded-[var(--r-sm)] p-3 leading-[1.7] whitespace-pre-wrap"
              style={{ background: 'var(--bg-sunken)', color: 'var(--ink-2)' }}
            >
              {profile.systemPrompt}
            </pre>
          ) : null}
        </Section>

        <Section title={`Tools in scope · ${profile.toolSummaries.length}`}>
          <ul className="space-y-3">
            {profile.toolSummaries.map((tool) => (
              <li key={tool.name}>
                <code className="mono block break-all" style={{ color: profile.accent }}>
                  {tool.signature}
                </code>
                <p className="t-label mt-1 leading-relaxed">{tool.description}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Retrieval" last>
          <div className="mono mb-3" style={{ color: 'var(--ink-3)' }}>
            {profile.ragSources.join(' · ')}
          </div>

          {metadata?.retrieval ? (
            metadata.retrieval.hits.length > 0 ? (
              <>
                <div className="t-label mb-2">
                  {metadata.retrieval.hits.length} hit
                  {metadata.retrieval.hits.length === 1 ? '' : 's'} · {metadata.retrieval.backend}{' '}
                  embeddings
                </div>
                <ul className="space-y-3">
                  {metadata.retrieval.hits.map((hit, index) => (
                    <li key={index}>
                      <div className="mb-1 flex items-baseline gap-2">
                        <span className="mono flex-1 truncate" style={{ color: 'var(--ink-3)' }}>
                          {hit.source}
                        </span>
                        <span className="mono" style={{ color: profile.accent }}>
                          {hit.score.toFixed(3)}
                        </span>
                      </div>
                      <div
                        className="mb-1.5 h-[2px] w-full"
                        style={{ background: 'var(--line)' }}
                        aria-hidden="true"
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(100, Math.max(3, hit.score * 100))}%`,
                            background: profile.accent,
                          }}
                        />
                      </div>
                      <p className="t-label leading-relaxed">
                        {hit.content.length > 170 ? `${hit.content.slice(0, 169)}…` : hit.content}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Hint>
                Nothing cleared the relevance floor for that query. The agent was told so explicitly
                rather than left to fill the gap.
              </Hint>
            )
          ) : (
            <Hint>Send a message to see what the retriever pulled.</Hint>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  action,
  children,
  last = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section
      className={last ? 'px-5 py-5' : 'border-b px-5 py-5'}
      style={{ borderColor: 'var(--line)' }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="t-label flex-1">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Hint({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`t-label leading-relaxed ${className}`}>{children}</p>;
}
