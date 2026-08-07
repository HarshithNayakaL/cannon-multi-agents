'use client';

import { ArrowRight, Check, Sparkles, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { AgentIcon } from '@/components/shell/agent-icon';
import { rankAgents, recommendModel, type AgentMatch } from '@/lib/agents/dispatch';
import type { AgentProfile } from '@/lib/agents/registry';
import type { AgentId } from '@/lib/agents/types';
import { PROVIDERS, formatContext, type ModelInfo, type ProviderId } from '@/lib/ai/catalog';

const EXAMPLES = [
  'Bench press 4x8 at 72.5kg, RPE 8',
  'What is slipping this week?',
  'Spent 840 at BigBasket on groceries',
  'Add the RAG survey paper to my queue',
];

/**
 * Dispatch — the front door.
 *
 * You state the job once. The scorer ranks every desk against its own
 * vocabulary and the request's shape picks a model, and both are shown as a
 * recommendation you can overrule rather than a decision made for you. The
 * whole field stays on screen: four desks, both providers, every model this
 * deployment can actually reach.
 *
 * Nothing is hidden behind the recommendation, because the point of the screen
 * is to make the multi-agent structure legible — a router that silently picked
 * for you would hide exactly the thing worth seeing.
 */
export function DispatchConsole({
  profiles,
  models,
}: {
  profiles: AgentProfile[];
  models: ModelInfo[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [pickedAgent, setPickedAgent] = useState<AgentId | null>(null);
  const [pickedModel, setPickedModel] = useState<string | null>(null);

  const trimmed = query.trim();

  // Re-scored on every keystroke. It is a keyword pass over four short word
  // lists — cheap enough that debouncing would only add lag.
  const ranked = useMemo(
    () => (trimmed.length > 0 ? rankAgents(trimmed, profiles) : []),
    [trimmed, profiles],
  );

  const byId = useMemo(() => new Map(ranked.map((match) => [match.agentId, match])), [ranked]);

  const suggestedAgent = ranked[0]?.score ? ranked[0].agentId : null;
  const suggestedModel = useMemo(
    () => (trimmed.length > 0 ? recommendModel(trimmed, models) : null),
    [trimmed, models],
  );

  const agent = pickedAgent ?? suggestedAgent;
  const model = pickedModel ?? suggestedModel?.model.key ?? null;
  const target = profiles.find((profile) => profile.id === agent) ?? null;

  function dispatch(event?: FormEvent) {
    event?.preventDefault();
    if (!target) return;

    const params = new URLSearchParams();
    if (trimmed.length > 0) params.set('q', trimmed);
    // Only a real pin travels. Letting the *suggestion* ride along would turn
    // a hint into a silent override of the fallback chain.
    if (pickedModel) params.set('model', pickedModel);

    const search = params.toString();
    router.push(`/${target.id}${search ? `?${search}` : ''}`);
  }

  return (
    <div className="scroll relative z-10 h-full min-w-0 flex-1 overflow-y-auto px-4 sm:px-10">
      <div className="mx-auto w-full max-w-[64rem] pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:pt-14 md:pb-16">
        {/* ---------------- Ask ---------------- */}
        <header className="enter mb-8 max-w-[42rem]">
          <div className="mb-4 flex items-center gap-2">
            <span className="dot" style={{ background: 'var(--accent)' }} aria-hidden="true" />
            <span className="mono" style={{ color: 'var(--ink-3)' }}>
              {profiles.length} agents · {models.length || 'no'} models configured
            </span>
          </div>

          <h1 className="t-display mb-4">What do you need?</h1>
          <p className="t-body max-w-[52ch]" style={{ color: 'var(--ink-2)' }}>
            Say it in your own words. Cannon scores it against every desk&apos;s vocabulary, picks a
            model for the shape of the request, and shows you both before anything runs.
          </p>
        </header>

        <form onSubmit={dispatch} className="enter mb-4">
          <div className="material flex items-center gap-2 !rounded-[var(--r-xl)] p-2.5">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                // A new question invalidates a pick made for the old one.
                setPickedAgent(null);
                setPickedModel(null);
              }}
              placeholder="Log a set, check what's slipping, capture a spend…"
              aria-label="Describe what you need"
              data-testid="dispatch-input"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[1rem] outline-none"
            />
            <button
              type="submit"
              disabled={!target}
              aria-label={target ? `Open the ${target.name} agent` : 'Choose an agent first'}
              className="btn btn-primary size-10 min-h-0 shrink-0 !px-0"
            >
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </form>

        {trimmed.length === 0 ? (
          <div className="mb-12 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="tag lift"
              >
                {example}
              </button>
            ))}
          </div>
        ) : (
          <Recommendation
            target={target}
            match={agent ? (byId.get(agent) ?? null) : null}
            modelKey={model}
            models={models}
            modelReason={suggestedModel?.reason ?? null}
            overridden={pickedAgent !== null}
            onGo={() => dispatch()}
          />
        )}

        {/* ---------------- The field ---------------- */}
        <Section
          title="Agents"
          note="Each desk has its own prompt, tools and retrieval scope. None can read another's data."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {profiles.map((profile) => (
              <AgentTile
                key={profile.id}
                profile={profile}
                match={byId.get(profile.id) ?? null}
                recommended={profile.id === suggestedAgent}
                selected={profile.id === agent}
                scoring={trimmed.length > 0}
                onSelect={() => setPickedAgent(profile.id)}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Providers"
          note="A pick moves that model to the front of the fallback chain. The rest stays behind it."
        >
          {models.length === 0 ? (
            <p className="card t-small p-5">
              No provider key is set, so inference is simulated against a scripted pattern-matcher.
              Tools, retrieval and persistence still run for real. Set{' '}
              <span className="mono">GROQ_API_KEY</span> or{' '}
              <span className="mono">GOOGLE_GENERATIVE_AI_API_KEY</span> to use a real model.
            </p>
          ) : (
            <div className="space-y-6">
              {(Object.keys(PROVIDERS) as ProviderId[]).map((providerId) => {
                const owned = models.filter((entry) => entry.provider === providerId);
                if (owned.length === 0) return null;
                const provider = PROVIDERS[providerId];

                return (
                  <div key={providerId}>
                    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="flex items-center gap-2">
                        <span
                          className="dot"
                          style={{ background: provider.accent }}
                          aria-hidden="true"
                        />
                        <h3 className="t-subtitle">{provider.name}</h3>
                      </span>
                      <span className="t-label">{provider.blurb}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {owned.map((entry) => (
                        <ModelTile
                          key={entry.key}
                          model={entry}
                          selected={entry.key === model}
                          recommended={entry.key === suggestedModel?.model.key}
                          onSelect={() =>
                            setPickedModel((current) => (current === entry.key ? null : entry.key))
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="mb-4">
        <h2 className="t-title mb-1">{title}</h2>
        <p className="t-small max-w-[60ch]">{note}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * The verdict strip. It states the desk, the model and — critically — *why*,
 * because a recommendation you cannot interrogate is just a guess with better
 * typography.
 */
function Recommendation({
  target,
  match,
  modelKey,
  models,
  modelReason,
  overridden,
  onGo,
}: {
  target: AgentProfile | null;
  match: AgentMatch | null;
  modelKey: string | null;
  models: ModelInfo[];
  modelReason: string | null;
  overridden: boolean;
  onGo: () => void;
}) {
  const model = models.find((entry) => entry.key === modelKey) ?? null;

  if (!target) {
    return (
      <div className="card enter mb-12 p-5">
        <p className="t-small">
          Nothing in that matched a desk&apos;s vocabulary. Pick one below — the scorer is a
          starting point, not a gate.
        </p>
      </div>
    );
  }

  return (
    <div
      className="card enter mb-12 overflow-hidden"
      data-testid="dispatch-recommendation"
      data-agent={target.id}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-[var(--r-md)]"
          style={{ background: target.accentSoft, color: target.accent }}
          aria-hidden="true"
        >
          <AgentIcon agent={target.id} className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <span className="t-label">{overridden ? 'Your pick' : 'Recommended'}</span>
            {!overridden ? (
              <Sparkles className="size-3" style={{ color: target.accent }} aria-hidden="true" />
            ) : null}
          </div>
          <h2 className="t-subtitle truncate">{target.title}</h2>
        </div>

        <button type="button" onClick={onGo} className="btn btn-primary shrink-0">
          Open
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div
        className="grid gap-x-6 gap-y-3 border-t px-5 py-4 sm:grid-cols-2"
        style={{ borderColor: 'var(--line)' }}
      >
        <div>
          <div className="t-label mb-1">Why this desk</div>
          <p className="t-small">
            {match && match.matched.length > 0 ? (
              <>
                matched{' '}
                <span className="mono" style={{ color: target.accent }}>
                  {match.matched.slice(0, 5).join(', ')}
                </span>
              </>
            ) : (
              'Chosen by you rather than by the scorer.'
            )}
          </p>
        </div>

        <div>
          <div className="t-label mb-1">Model</div>
          <p className="t-small">
            {model ? (
              <>
                <span style={{ color: 'var(--ink)' }}>{model.name}</span>
                {modelReason ? ` — ${modelReason}` : null}
              </>
            ) : (
              'Simulated — no provider key is set.'
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function AgentTile({
  profile,
  match,
  recommended,
  selected,
  scoring,
  onSelect,
}: {
  profile: AgentProfile;
  match: AgentMatch | null;
  recommended: boolean;
  selected: boolean;
  scoring: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="agent-tile"
      data-agent={profile.id}
      className="card lift flex flex-col items-start p-5 text-left"
      style={selected ? { borderColor: profile.accent } : undefined}
    >
      <div className="mb-3 flex w-full items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-[var(--r-md)]"
          style={{ background: profile.accentSoft, color: profile.accent }}
          aria-hidden="true"
        >
          <AgentIcon agent={profile.id} className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="t-subtitle block truncate">{profile.name}</span>
          <span className="t-label block truncate">{profile.toolSummaries.length} tools</span>
        </span>
        {recommended ? (
          <Sparkles className="size-4 shrink-0" style={{ color: profile.accent }} />
        ) : selected ? (
          <Check className="size-4 shrink-0" style={{ color: profile.accent }} />
        ) : null}
      </div>

      <p className="t-small mb-3 flex-1">{profile.tagline}</p>

      {/* The confidence bar only appears once there is a query to be confident
          about. Rendering it empty would imply a score of zero rather than
          "nothing asked yet". */}
      {scoring ? (
        <div className="w-full">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="mono truncate" style={{ color: 'var(--ink-3)' }}>
              {match && match.matched.length > 0
                ? match.matched.slice(0, 3).join(' · ')
                : 'no match'}
            </span>
            <span className="mono shrink-0" style={{ color: 'var(--ink-3)' }}>
              {Math.round((match?.confidence ?? 0) * 100)}%
            </span>
          </div>
          <div
            className="h-[3px] w-full overflow-hidden rounded-[var(--r-pill)]"
            style={{ background: 'var(--line)' }}
            aria-hidden="true"
          >
            <div
              className="h-full rounded-[var(--r-pill)] transition-[width] duration-300"
              style={{
                width: `${Math.round((match?.confidence ?? 0) * 100)}%`,
                background: profile.accent,
              }}
            />
          </div>
        </div>
      ) : (
        <span className="mono truncate" style={{ color: 'var(--ink-3)' }}>
          {profile.ragSources.join(' · ')}
        </span>
      )}
    </button>
  );
}

function ModelTile({
  model,
  selected,
  recommended,
  onSelect,
}: {
  model: ModelInfo;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="model-tile"
      data-model={model.key}
      className="card lift flex flex-col items-start p-4 text-left"
      style={selected ? { borderColor: 'var(--accent)' } : undefined}
    >
      <div className="mb-1.5 flex w-full items-center gap-2">
        <span className="t-subtitle min-w-0 flex-1 truncate">{model.name}</span>
        {recommended ? (
          <Sparkles className="size-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
        ) : selected ? (
          <Check className="size-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
        ) : null}
      </div>

      <p className="t-small mb-3 flex-1">{model.strength}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {model.speed ? (
          <span className="mono inline-flex items-center gap-1" style={{ color: 'var(--ink-3)' }}>
            <Zap className="size-3" aria-hidden="true" />
            {model.speed} tok/s
          </span>
        ) : null}
        <span className="mono" style={{ color: 'var(--ink-3)' }}>
          {formatContext(model.contextTokens)} ctx
        </span>
      </div>
    </button>
  );
}
