'use client';

import { ArrowRight, Check, Loader2, Plus, Sparkles, Trash2, Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { ModelBadges } from '@/components/chat/model-badges';
import { ModelPicker } from '@/components/chat/model-picker';
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
  const [pickerOpen, setPickerOpen] = useState(false);

  // Creating an agent is a server round-trip that writes a row, so it needs
  // real pending and error states rather than optimism.
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

  /**
   * Build a desk for whatever was typed.
   *
   * The new agent opens empty rather than with the description auto-sent: the
   * sentence describes the *desk*, not a question for it, and firing it as a
   * first message would put "track my houseplants" in the transcript as
   * though it were a request.
   */
  async function create() {
    if (trimmed.length < 3 || creating) return;
    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description: trimmed }),
      });
      const payload = (await response.json()) as { agent?: AgentProfile; error?: string };

      if (!response.ok || !payload.agent) {
        setCreateError(payload.error ?? 'Could not create the agent.');
        return;
      }

      // `refresh` repopulates the rail and this page's own agent list from the
      // server before navigating, so the new desk is present when it lands.
      router.refresh();
      router.push(`/${payload.agent.id}`);
    } catch {
      setCreateError('Could not reach the server.');
    } finally {
      setCreating(false);
    }
  }

  async function remove(profile: AgentProfile) {
    if (!profile.custom) return;
    const response = await fetch(`/api/agents/${profile.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setCreateError(payload?.error ?? `Could not delete ${profile.name}.`);
      return;
    }
    if (pickedAgent === profile.id) setPickedAgent(null);
    router.refresh();
  }

  // The verdict shows whenever there is something to open: a desk the scorer
  // chose for the words typed, or one the user tapped with nothing typed yet.
  const showVerdict = trimmed.length > 0 || target !== null;
  const groqOrder = (Object.keys(PROVIDERS) as ProviderId[]).filter((id) =>
    models.some((entry) => entry.provider === id),
  );

  return (
    <div className="scroll relative z-10 h-full min-w-0 flex-1 overflow-y-auto">
      <div className="dispatch-page mx-auto w-full max-w-[72rem] px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-8 sm:pt-10 lg:px-12 lg:pt-14">
        {/* ---------------- Head ---------------- */}
        <header className="enter mb-5 sm:mb-8">
          <div className="mb-2 flex items-center gap-2">
            <span className="dot" style={{ background: 'var(--accent)' }} aria-hidden="true" />
            <span className="mono" style={{ color: 'var(--ink-3)' }}>
              {profiles.length} desks · {models.length || 'no'} models
            </span>
          </div>
          <h1 className="t-display">What do you need?</h1>
          <p className="t-body mt-2 hidden max-w-[56ch] lg:block" style={{ color: 'var(--ink-2)' }}>
            Say it in your own words. Cannon ranks every desk against it and picks a model for its
            shape — both shown before anything runs.
          </p>
        </header>

        {/* ---------------- Ask ----------------
            One form, two homes. Under lg it docks to the bottom of the screen,
            above the tab bar, where the thumb already is, and the desk list
            re-ranks above it as you type. From lg it sits at the top of the
            page and the verdict sits beneath it. */}
        <form onSubmit={dispatch} className="dispatch-dock" aria-label="Dispatch">
          <div className="dispatch-dock-inner">
            {showVerdict ? (
              <Recommendation
                target={target}
                match={agent ? (byId.get(agent) ?? null) : null}
                modelKey={model}
                models={models}
                modelReason={suggestedModel?.reason ?? null}
                overridden={pickedAgent !== null}
                onGo={() => dispatch()}
                onCreate={create}
                busy={creating}
              />
            ) : null}

            <div className="ask flex items-center gap-2 p-1.5">
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
                enterKeyHint="go"
                className="min-h-[var(--tap)] min-w-0 flex-1 bg-transparent px-3 text-[1rem] outline-none focus-visible:outline-none"
              />
              <button
                type="submit"
                onPointerDown={(event) => event.preventDefault()}
                disabled={!target}
                aria-label={target ? `Open the ${target.name} agent` : 'Choose an agent first'}
                className="btn btn-primary btn-round"
              >
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>

        {trimmed.length === 0 ? (
          <div className="rail-x mb-8 lg:mb-10" aria-label="Examples" role="group">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="tag chip lift"
              >
                {example}
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-8 lg:mb-10" />
        )}

        {createError ? (
          <p className="card t-small mb-6 p-4" role="alert" style={{ color: 'var(--bad)' }}>
            {createError}
          </p>
        ) : null}

        {/* ---------------- The field ---------------- */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
          <Section
            title="Desks"
            aside={trimmed.length > 0 ? 'ranked for what you typed' : `${profiles.length} desks`}
          >
            <ul className="list" data-testid="desk-list">
              {profiles.map((profile) => (
                <li key={profile.id}>
                  <AgentTile
                    profile={profile}
                    match={byId.get(profile.id) ?? null}
                    recommended={profile.id === suggestedAgent}
                    selected={profile.id === agent}
                    scoring={trimmed.length > 0}
                    onSelect={() => setPickedAgent(profile.id)}
                    onDelete={profile.custom ? () => remove(profile) : undefined}
                  />
                </li>
              ))}
              <li>
                <CreateTile description={trimmed} busy={creating} onCreate={create} />
              </li>
            </ul>
          </Section>

          {/* Phone and tablet: the model is one line that opens a sheet. A grid
              of model tiles there pushed the desks a screen and a half down. */}
          <div className="lg:hidden">
            <Section title="Model" aside={pickedModel ? 'your pick' : 'auto'}>
              <div className="card flex items-center gap-3 p-3 pl-4">
                <p className="t-small min-w-0 flex-1 truncate">
                  {models.length === 0
                    ? 'Simulated — no provider key is set.'
                    : pickedModel
                      ? (models.find((entry) => entry.key === pickedModel)?.name ?? 'Auto')
                      : suggestedModel
                        ? `Auto · ${suggestedModel.model.name}`
                        : 'Auto — Groq first, Gemini behind it'}
                </p>
                <ModelPicker
                  models={models}
                  value={pickedModel ?? undefined}
                  onChange={(key) => setPickedModel(key ?? null)}
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                />
              </div>
            </Section>
          </div>

          <div className="hidden lg:block">
            <Section title="Models" aside="a pick goes to the front of the fallback chain">
              {models.length === 0 ? (
                <p className="card t-small p-5">
                  No provider key is set, so inference is simulated against a scripted
                  pattern-matcher. Tools, retrieval and persistence still run for real. Set{' '}
                  <span className="mono">GROQ_API_KEY</span> or{' '}
                  <span className="mono">GOOGLE_GENERATIVE_AI_API_KEY</span> to use a real model.
                </p>
              ) : (
                <div className="space-y-6">
                  {groqOrder.map((providerId) => {
                    const provider = PROVIDERS[providerId];
                    return (
                      <div key={providerId}>
                        <div className="mb-2 flex items-center gap-2">
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
                        <ul className="list">
                          {models
                            .filter((entry) => entry.provider === providerId)
                            .map((entry) => (
                              <li key={entry.key}>
                                <ModelTile
                                  model={entry}
                                  selected={entry.key === model}
                                  recommended={entry.key === suggestedModel?.model.key}
                                  onSelect={() =>
                                    setPickedModel((current) =>
                                      current === entry.key ? null : entry.key,
                                    )
                                  }
                                />
                              </li>
                            ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="eyebrow">{title}</h2>
        {aside ? <span className="t-label truncate">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The verdict. It states the desk, the model and — critically — *why*,
 * because a recommendation you cannot interrogate is just a guess with better
 * typography. Compact on a phone, where it rides in the dock above the input.
 */
function Recommendation({
  target,
  match,
  modelKey,
  models,
  modelReason,
  overridden,
  onGo,
  onCreate,
  busy,
}: {
  target: AgentProfile | null;
  match: AgentMatch | null;
  modelKey: string | null;
  models: ModelInfo[];
  modelReason: string | null;
  overridden: boolean;
  onGo: () => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const model = models.find((entry) => entry.key === modelKey) ?? null;

  if (!target) {
    return (
      <div className="verdict enter flex items-center gap-3 p-3 pl-4">
        <p className="t-small min-w-0 flex-1">
          No desk owns that vocabulary. Build one for it, or pick a desk.
        </p>
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="btn btn-primary shrink-0 !px-4"
          data-testid="create-from-recommendation"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          {busy ? 'Building…' : 'Build'}
        </button>
      </div>
    );
  }

  const why = match && match.matched.length > 0 ? match.matched.slice(0, 4).join(', ') : null;

  return (
    <div
      className="verdict enter overflow-hidden"
      data-testid="dispatch-recommendation"
      data-agent={target.id}
      style={{ '--desk': target.accent } as React.CSSProperties}
    >
      <div className="flex items-center gap-3 p-3 pl-4 sm:p-4">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-[var(--r-md)]"
          style={{ background: target.accentSoft, color: target.accent }}
          aria-hidden="true"
        >
          <AgentIcon agent={target.id} label={target.name} className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="t-label">{overridden ? 'Your pick' : 'Recommended'}</span>
            {!overridden ? (
              <Sparkles className="size-3" style={{ color: target.accent }} aria-hidden="true" />
            ) : null}
          </div>
          <h2 className="truncate text-[0.9375rem] leading-snug font-semibold">{target.title}</h2>
          {/* One line on a phone; the full reasoning gets its own rows above. */}
          <p className="t-label truncate sm:hidden">
            {why ? (
              <>
                matched <span style={{ color: target.accent }}>{why}</span>
              </>
            ) : model ? (
              model.name
            ) : (
              'simulated model'
            )}
          </p>
        </div>

        <button type="button" onClick={onGo} className="btn btn-primary shrink-0 !px-4">
          Open
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <dl
        className="hidden gap-x-8 gap-y-2 border-t px-4 py-3 sm:grid sm:grid-cols-2"
        style={{ borderColor: 'var(--line)' }}
      >
        <div className="min-w-0">
          <dt className="t-label">Why this desk</dt>
          <dd className="t-small truncate">
            {why ? (
              <>
                matched{' '}
                <span className="mono" style={{ color: target.accent }}>
                  {why}
                </span>
              </>
            ) : (
              'Chosen by you rather than by the scorer.'
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="t-label">Model</dt>
          <dd className="t-small truncate">
            {model ? (
              <>
                <span style={{ color: 'var(--ink)' }}>{model.name}</span>
                {modelReason ? ` — ${modelReason}` : null}
              </>
            ) : (
              'Simulated — no provider key is set.'
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * A desk as a row, not a card. Four equal cards said the desks were
 * interchangeable; a ranked list says which one fits, and the match bar fills
 * as you type so the routing is visible while it happens.
 */
function AgentTile({
  profile,
  match,
  recommended,
  selected,
  scoring,
  onSelect,
  onDelete,
}: {
  profile: AgentProfile;
  match: AgentMatch | null;
  recommended: boolean;
  selected: boolean;
  scoring: boolean;
  onSelect: () => void;
  /** Present only for created agents; the four coded desks cannot be removed. */
  onDelete?: () => void;
}) {
  const percent = Math.round((match?.confidence ?? 0) * 100);

  // Delete sits beside the select button rather than inside it — a button
  // nested in a button is invalid.
  return (
    <div className="row-wrap" style={{ '--desk': profile.accent } as React.CSSProperties}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        data-testid="agent-tile"
        data-agent={profile.id}
        className="row"
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-[var(--r-md)]"
          style={{ background: profile.accentSoft, color: profile.accent }}
          aria-hidden="true"
        >
          <AgentIcon agent={profile.id} label={profile.name} className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[0.9375rem] font-semibold">{profile.name}</span>
            {recommended ? (
              <Sparkles className="size-3.5 shrink-0" style={{ color: profile.accent }} />
            ) : selected ? (
              <Check className="size-3.5 shrink-0" style={{ color: profile.accent }} />
            ) : null}
          </span>
          <span className="t-label block truncate">
            {scoring && match && match.matched.length > 0
              ? `matched ${match.matched.slice(0, 3).join(' · ')}`
              : profile.tagline}
          </span>
        </span>

        {/* Shown only once there is a query: an empty bar would claim a score
            of zero rather than "nothing asked yet". */}
        {scoring ? (
          <span className="flex w-[5.5rem] shrink-0 items-center gap-2" aria-hidden="true">
            <span className="meter">
              <span style={{ width: `${percent}%`, background: profile.accent }} />
            </span>
            <span className="mono w-8 text-right" style={{ color: 'var(--ink-3)' }}>
              {percent > 0 ? `${percent}%` : '–'}
            </span>
          </span>
        ) : (
          <span className="mono hidden shrink-0 sm:inline" style={{ color: 'var(--ink-3)' }}>
            {profile.toolSummaries.length} tools{profile.custom ? ' · made' : ''}
          </span>
        )}
      </button>

      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete the ${profile.name} agent`}
          data-testid="delete-agent"
          className="icon-btn shrink-0"
        >
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Turns the typed sentence into a desk. It sits in the list with the existing
 * desks because "make a new one" is a peer of "use an existing one".
 */
function CreateTile({
  description,
  busy,
  onCreate,
}: {
  description: string;
  busy: boolean;
  onCreate: () => void;
}) {
  const ready = description.length >= 3;

  return (
    <div className="row-wrap">
      <button
        type="button"
        onClick={onCreate}
        disabled={!ready || busy}
        data-testid="create-tile"
        className="row row-dashed"
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-[var(--r-md)]"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          aria-hidden="true"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-semibold">
            {busy ? 'Building…' : 'New desk'}
          </span>
          <span className="t-label block truncate">
            {busy
              ? 'Writing its prompt, vocabulary and memory'
              : ready
                ? `for “${description}”`
                : 'Type what it is for above'}
          </span>
        </span>
      </button>
    </div>
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
    <div className="row-wrap">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        data-testid="model-tile"
        data-model={model.key}
        className="row !min-h-[3.25rem] !py-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[0.9375rem] font-medium">{model.name}</span>
            <ModelBadges model={model} />
            {recommended ? (
              <Sparkles className="size-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
            ) : selected ? (
              <Check className="size-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
            ) : null}
          </span>
          <span className="t-label block truncate">{model.strength}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {model.speed ? (
            <span className="mono inline-flex items-center gap-1" style={{ color: 'var(--ink-2)' }}>
              <Zap className="size-3" aria-hidden="true" />
              {model.speed}
            </span>
          ) : null}
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {formatContext(model.contextTokens)}
          </span>
        </span>
      </button>
    </div>
  );
}
