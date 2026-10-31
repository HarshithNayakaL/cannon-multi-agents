'use client';

import { ArrowUpRight } from 'lucide-react';

import type { AgentProfile } from '@/lib/agents/registry';

/**
 * First run per agent. Says what this desk is for and what it can reach, then
 * hands over four levers written the way you would actually type them — the
 * fastest way to learn a tool is to watch it do the thing once.
 */
export function EmptyState({
  profile,
  onPick,
}: {
  profile: AgentProfile;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="enter flex min-h-full flex-col justify-end py-4 sm:justify-center sm:py-10">
      <div className="mb-6 max-w-[36rem] sm:mb-9">
        <div className="mb-4 flex items-center gap-2">
          <span className="dot" style={{ background: profile.accent }} aria-hidden="true" />
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {profile.ragSources.join(' · ')}
          </span>
        </div>

        <h2 className="t-display mb-3 sm:mb-5">{profile.title}</h2>

        <p className="t-body max-w-[48ch]" style={{ color: 'var(--ink-2)' }}>
          {profile.tagline}. Its own prompt, its own tools, its own retrieval scope — nothing here
          can read the other desk&apos;s data.
        </p>
      </div>

      {/* Bottom-weighted on a phone: the levers sit just above the composer,
          in thumb reach, instead of at the top of a tall empty column. */}
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
        {profile.suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="card lift group flex min-h-[var(--tap-primary)] items-center gap-3 px-4 py-3 text-left sm:items-start sm:p-5"
          >
            <span className="t-small flex-1" style={{ color: 'var(--ink-2)' }}>
              {suggestion}
            </span>
            <ArrowUpRight
              className="hover-reveal size-4 shrink-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:mt-0.5"
              style={{ color: profile.accent }}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
