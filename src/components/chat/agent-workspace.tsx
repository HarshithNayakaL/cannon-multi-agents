'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { PanelRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { Composer } from '@/components/chat/composer';
import { EmptyState } from '@/components/chat/empty-state';
import { MessageRow } from '@/components/chat/message-row';
import { ModelPicker } from '@/components/chat/model-picker';
import { ErrorPanel, StreamingIndicator } from '@/components/chat/status-strip';
import { PromptInspector } from '@/components/inspector/prompt-inspector';
import { AgentIcon } from '@/components/shell/agent-icon';
import type { CannonMetadata, CannonUIMessage } from '@/lib/agents/message';
import type { AgentProfile } from '@/lib/agents/registry';
import type { ModelInfo } from '@/lib/ai/catalog';
import type { RuntimeCapabilities } from '@/lib/env';

const WIDE_QUERY = '(min-width: 1280px)';

/** Subscribes to the viewport instead of snapshotting it once on mount. */
function useWideViewport(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE_QUERY);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

export function AgentWorkspace({
  profile,
  capabilities,
  models,
  initialModel,
  initialQuery,
}: {
  profile: AgentProfile;
  capabilities: RuntimeCapabilities;
  /** Catalog entries this deployment actually holds a key for. */
  models: ModelInfo[];
  /** Model pinned by the dispatch screen, if the hand-off named one. */
  initialModel?: string;
  /** Question typed on the dispatch screen, sent once on arrival. */
  initialQuery?: string;
}) {
  // `undefined` means auto — run the configured fallback chain untouched.
  // A key handed over in the URL is only honoured if it is really in the
  // catalog *and* this deployment can serve it; a stale link must not pin a
  // model the server would silently ignore.
  const [model, setModel] = useState<string | undefined>(() =>
    initialModel && models.some((entry) => entry.key === initialModel) ? initialModel : undefined,
  );
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // Docked by default where there is room for a third column; on anything
  // narrower it is a sheet, and a sheet must never open uninvited. Until the
  // user expresses a preference the viewport decides — including on resize.
  const wideViewport = useWideViewport();
  const [preference, setPreference] = useState<boolean | null>(null);
  const inspectorOpen = preference ?? wideViewport;
  const setInspectorOpen = (next: boolean | ((open: boolean) => boolean)) =>
    setPreference((current) => (typeof next === 'function' ? next(current ?? wideViewport) : next));

  // `createPortal` needs document, which does not exist during SSR.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const transcript = useRef<HTMLDivElement>(null);

  // Each agent re-lights the room: the accent drives the canvas wash, focus
  // rings and every accented mark, so switching desks is felt, not just read.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--accent', profile.accent);
    root.setProperty('--accent-soft', profile.accentSoft);
  }, [profile]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<CannonUIMessage>({
        api: `/api/agents/${profile.id}/chat`,
      }),
    [profile.id],
  );

  const { messages, sendMessage, status, stop, error, regenerate, clearError } =
    useChat<CannonUIMessage>({ id: profile.id, transport });

  const busy = status === 'submitted' || status === 'streaming';

  // Follow the stream, but only while the user is already near the bottom —
  // yanking the viewport away from someone re-reading an earlier answer is
  // worse than making them scroll.
  useEffect(() => {
    const element = transcript.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance < 220) {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, status]);

  const latestMetadata: CannonMetadata | undefined = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const metadata = messages[index].metadata;
      if (metadata) return metadata;
    }
    return undefined;
  }, [messages]);

  // The pin travels with the request rather than the transport, so switching
  // model mid-conversation applies to the next turn without tearing down the
  // chat and losing the transcript.
  function send(text: string) {
    clearError();
    void sendMessage({ text }, { body: { model } });
  }

  // Arriving from the dispatch screen sends the question the user already
  // typed there — being made to type it a second time is the whole reason
  // routing screens feel like a tax.
  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current) return;
    if (!initialQuery || messages.length > 0) return;
    handedOff.current = true;
    void sendMessage({ text: initialQuery }, { body: { model } });
    // `model` and `messages` are read at fire time; re-running on either would
    // re-send the hand-off, which the ref already exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const live = capabilities.inference !== 'simulated';

  return (
    <div className="relative z-10 flex h-full min-h-0 min-w-0 flex-1">
      {/* ---------------- Chat column ---------------- */}
      <section className="flex h-full min-w-0 flex-1 flex-col">
        {/* Header shares the transcript's measure so nothing drifts left of
            the conversation on a very wide display. */}
        <div
          className="border-b px-4 pt-[env(safe-area-inset-top)] sm:px-10"
          style={{ borderColor: 'var(--line)' }}
        >
          <header className="mx-auto flex w-full max-w-[52rem] items-center gap-2 py-2 sm:gap-3 sm:py-4 3xl:max-w-[62rem]">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-[var(--r-md)] md:hidden"
              style={{ background: profile.accentSoft, color: profile.accent }}
              aria-hidden="true"
            >
              <AgentIcon agent={profile.id} label={profile.name} className="size-[18px]" />
            </span>

            {/* Short name on a phone, full title once there is room. At 390px
                "Learning Agent" wraps to two lines and shoves the header
                taller; the icon beside it already says which desk this is. */}
            <div className="min-w-0 flex-1">
              <h1 className="t-title truncate">
                <span className="sm:hidden">{profile.name}</span>
                <span className="hidden sm:inline">{profile.title}</span>
              </h1>
            </div>

            {/* The storage chip is the first thing to go when space runs
                out — it never changes during a session. The model does. */}
            <span className="status hidden lg:inline-flex">
              <span
                className="dot"
                style={{ background: live ? 'var(--good)' : 'var(--idle)' }}
                aria-hidden="true"
              />
              {capabilities.storage}
            </span>

            <ModelPicker
              models={models}
              value={model}
              onChange={setModel}
              open={modelPickerOpen}
              onOpenChange={setModelPickerOpen}
            />

            <button
              type="button"
              onClick={() => setInspectorOpen((open) => !open)}
              aria-expanded={inspectorOpen}
              aria-label={inspectorOpen ? 'Hide prompt inspector' : 'Show prompt inspector'}
              className="icon-btn shrink-0"
              style={inspectorOpen ? { color: 'var(--ink)' } : undefined}
            >
              <PanelRight className="size-[18px]" />
            </button>
          </header>
        </div>

        <div
          ref={transcript}
          className="scroll min-h-0 flex-1 overflow-y-auto px-4 sm:px-10"
          data-testid="transcript"
        >
          <div className="mx-auto flex min-h-full w-full max-w-[52rem] flex-col gap-6 py-5 sm:gap-8 sm:py-8 3xl:max-w-[62rem]">
            {messages.length === 0 ? (
              <EmptyState profile={profile} onPick={send} />
            ) : (
              messages.map((message) => (
                <MessageRow key={message.id} message={message} profile={profile} />
              ))
            )}

            {status === 'submitted' ? <StreamingIndicator label="thinking" /> : null}
            {status === 'streaming' ? <StreamingIndicator label="streaming" /> : null}

            {error ? (
              <ErrorPanel
                message={error.message || 'The agent call failed before it produced a response.'}
                onRetry={() => {
                  clearError();
                  void regenerate();
                }}
              />
            ) : null}
          </div>
        </div>

        {/* Reserves exactly the tab bar's height. While the keyboard is up that
            drops to zero and the composer sits directly on the keys. */}
        <div className="composer-dock px-3 pt-2 sm:px-10 md:pb-6">
          <div className="mx-auto w-full max-w-[52rem] 3xl:max-w-[62rem]">
            <Composer
              onSend={send}
              onStop={stop}
              busy={busy}
              placeholder={`Message the ${profile.name} agent…`}
            />
          </div>
        </div>
      </section>

      {/* ----- Inspector: docked where there is room for a third column ----- */}
      {inspectorOpen && wideViewport ? (
        <aside
          aria-label="Prompt inspector"
          className="w-[340px] shrink-0 border-l 3xl:w-[380px]"
          style={{ borderColor: 'var(--line)', background: 'var(--bg-panel)' }}
        >
          <PromptInspector profile={profile} metadata={latestMetadata} />
        </aside>
      ) : null}

      {/* ----- Inspector: sheet on anything narrower -----
          Portalled to <body> so it escapes this subtree's stacking context.
          Nested inside it, the sheet's z-index is scoped to the workspace's
          own layer and the fixed tab bar paints straight over the top of it. */}
      {inspectorOpen && !wideViewport && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-50"
              role="dialog"
              aria-modal="true"
              aria-label="Prompt inspector"
            >
              <button
                type="button"
                aria-label="Close inspector"
                onClick={() => setInspectorOpen(false)}
                className="fade absolute inset-0"
                style={{ background: 'rgba(0,0,0,0.55)' }}
              />
              {/* Always a bottom sheet below the docked breakpoint. A
                  half-width side drawer here would sit alongside the tab bar
                  and split the screen into two competing panels. */}
              <div
                className="sheet absolute inset-x-0 bottom-0 flex max-h-[84dvh] flex-col overflow-hidden rounded-t-[var(--r-xl)] border-t"
                style={{
                  // Opaque, not glass: a modal sits over arbitrary content,
                  // and translucency there means the page bleeds through.
                  background: 'var(--bg-panel)',
                  borderColor: 'var(--line-strong)',
                  boxShadow: 'var(--e-3)',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                }}
              >
                <PromptInspector
                  profile={profile}
                  metadata={latestMetadata}
                  onClose={() => setInspectorOpen(false)}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
