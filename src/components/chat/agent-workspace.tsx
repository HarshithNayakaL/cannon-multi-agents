'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { PanelRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { Composer } from '@/components/chat/composer';
import { EmptyState } from '@/components/chat/empty-state';
import { MessageRow } from '@/components/chat/message-row';
import { ErrorPanel, StreamingIndicator } from '@/components/chat/status-strip';
import { PromptInspector } from '@/components/inspector/prompt-inspector';
import { AgentIcon } from '@/components/shell/agent-icon';
import type { CannonMetadata, CannonUIMessage } from '@/lib/agents/message';
import type { AgentProfile } from '@/lib/agents/registry';
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
}: {
  profile: AgentProfile;
  capabilities: RuntimeCapabilities;
}) {
  // Docked by default where there is room for a third column; on anything
  // narrower it is a sheet, and a sheet must never open uninvited. Until the
  // user expresses a preference the viewport decides — including on resize.
  const wideViewport = useWideViewport();
  const [preference, setPreference] = useState<boolean | null>(null);
  const inspectorOpen = preference ?? wideViewport;
  const setInspectorOpen = (next: boolean | ((open: boolean) => boolean)) =>
    setPreference((current) => (typeof next === 'function' ? next(current ?? wideViewport) : next));

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

  function send(text: string) {
    clearError();
    void sendMessage({ text });
  }

  const live = capabilities.inference !== 'simulated';

  return (
    <div className="relative z-10 flex h-full min-w-0 flex-1">
      {/* ---------------- Chat column ---------------- */}
      <section className="flex h-full min-w-0 flex-1 flex-col">
        {/* Header shares the transcript's measure so nothing drifts left of
            the conversation on a very wide display. */}
        <div className="border-b px-6 sm:px-10" style={{ borderColor: 'var(--line)' }}>
          <header className="mx-auto flex w-full max-w-[52rem] items-center gap-3 py-5 3xl:max-w-[62rem]">
            <span
              className="flex size-8 items-center justify-center rounded-[var(--r-md)] md:hidden"
              style={{ color: profile.accent }}
              aria-hidden="true"
            >
              <AgentIcon agent={profile.id} className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <h1 className="t-title truncate">{profile.title}</h1>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <span className="status">
                <span
                  className="dot"
                  style={{ background: live ? 'var(--good)' : 'var(--idle)' }}
                  aria-hidden="true"
                />
                {capabilities.inference}
              </span>
              <span className="status">{capabilities.storage}</span>
            </div>

            <button
              type="button"
              onClick={() => setInspectorOpen((open) => !open)}
              aria-expanded={inspectorOpen}
              aria-label={inspectorOpen ? 'Hide prompt inspector' : 'Show prompt inspector'}
              className="icon-btn size-10 shrink-0"
              style={inspectorOpen ? { color: 'var(--ink)' } : undefined}
            >
              <PanelRight className="size-4" />
            </button>
          </header>
        </div>

        <div
          ref={transcript}
          className="scroll min-h-0 flex-1 overflow-y-auto px-6 sm:px-10"
          data-testid="transcript"
        >
          <div className="mx-auto flex min-h-full w-full max-w-[52rem] flex-col gap-8 py-8 3xl:max-w-[62rem]">
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

        <div className="px-6 pt-2 pb-[calc(env(safe-area-inset-bottom)+5.25rem)] sm:px-10 md:pb-6">
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

      {/* ----- Inspector: sheet on anything narrower ----- */}
      {inspectorOpen && !wideViewport ? (
        <div
          className="fixed inset-0 z-40 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Prompt inspector"
        >
          <button
            type="button"
            aria-label="Close inspector"
            onClick={() => setInspectorOpen(false)}
            className="fade absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.5)' }}
          />
          <div
            className="sheet overlay absolute inset-x-0 bottom-0 max-h-[86dvh] rounded-t-[var(--r-lg)] sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[380px] sm:rounded-none sm:border-y-0 sm:border-r-0"
            style={{ background: 'var(--bg-panel)' }}
          >
            <PromptInspector
              profile={profile}
              metadata={latestMetadata}
              onClose={() => setInspectorOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
