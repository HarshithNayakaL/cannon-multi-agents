'use client';

import { getToolName, isToolUIPart } from 'ai';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { CannonMetadata, CannonUIMessage } from '@/lib/agents/message';

type StepTone = 'done' | 'running' | 'failed' | 'warn' | 'idle';

export type RunStep = {
  key: string;
  label: string;
  detail?: string;
  value?: string;
  tone: StepTone;
};

/** Which provider label actually produced the answer. */
function answeredBy(meta: CannonMetadata): string | undefined {
  const last = meta.fallbacks?.at(-1);
  return last ? last.to : meta.chain[0];
}

/**
 * What one turn did, in the order it did it: retrieval, each tool call, the
 * model that answered (and any hand-off on the way), and the wall time.
 *
 * All of it was already on the message — the server states it in metadata so
 * the client never has to guess — but it lived only in a side panel most
 * people never opened. Putting it on the turn itself is the point of a
 * multi-agent tool: you can see which desk did what, with what.
 */
export function runSteps(message: CannonUIMessage, live: boolean): RunStep[] {
  const meta = message.metadata;
  const steps: RunStep[] = [];

  if (meta?.retrieval) {
    const { hits, backend } = meta.retrieval;
    const top = hits[0];
    steps.push({
      key: 'retrieve',
      label: 'retrieve',
      detail:
        hits.length > 0
          ? `${hits.length} from ${[...new Set(hits.map((hit) => hit.source))].slice(0, 2).join(', ')}`
          : `nothing cleared the floor · ${backend}`,
      value: top ? top.score.toFixed(2) : undefined,
      tone: hits.length > 0 ? 'done' : 'idle',
    });
  }

  message.parts.forEach((part, index) => {
    if (part.type !== 'dynamic-tool' && !isToolUIPart(part)) return;
    const running = part.state === 'input-streaming' || part.state === 'input-available';
    const failed = part.state === 'output-error';
    steps.push({
      key: `tool-${index}`,
      label: getToolName(part),
      detail: failed ? 'failed' : running ? 'running' : undefined,
      tone: failed ? 'failed' : running ? 'running' : 'done',
    });
  });

  if (meta) {
    const model = answeredBy(meta);
    const handoffs = meta.fallbacks?.length ?? 0;
    steps.push({
      key: 'model',
      label: 'answer',
      detail: meta.simulated ? 'simulated model' : model,
      value: handoffs > 0 ? `${handoffs} fallback${handoffs > 1 ? 's' : ''}` : undefined,
      tone: handoffs > 0 ? 'warn' : live ? 'running' : 'done',
    });
  } else if (live) {
    steps.push({ key: 'model', label: 'answer', detail: 'waiting', tone: 'running' });
  }

  return steps;
}

const TONE: Record<StepTone, string> = {
  done: 'var(--good)',
  running: 'var(--accent)',
  failed: 'var(--bad)',
  warn: 'var(--warn)',
  idle: 'var(--idle)',
};

export function RunSteps({ steps }: { steps: RunStep[] }) {
  return (
    <ol>
      {steps.map((step, index) => (
        <li key={step.key} className="run-step">
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span
                className={step.tone === 'running' ? 'tick' : 'dot'}
                style={{ background: TONE[step.tone] }}
                aria-hidden="true"
              />
              <span className="mono truncate" style={{ color: 'var(--ink)' }}>
                {step.label}
              </span>
            </span>
            {step.detail ? (
              <span className="mono block truncate" style={{ color: 'var(--ink-3)' }}>
                {step.detail}
              </span>
            ) : null}
          </span>
          {step.value ? (
            <span
              className="mono"
              style={{ color: step.tone === 'warn' ? 'var(--warn)' : 'var(--ink-2)' }}
            >
              {step.value}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function RunTrail({
  message,
  accent,
  live,
}: {
  message: CannonUIMessage;
  accent: string;
  /** This is the turn still streaming. */
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  const steps = runSteps(message, live);
  if (steps.length === 0) return null;

  const latency = message.metadata?.latencyMs;
  const summary = steps
    .filter((step) => step.key !== 'model')
    .map((step) => step.label)
    .join(' · ');

  return (
    <div
      className="run"
      data-open={open}
      data-testid="run-trail"
      style={{ '--desk': accent } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-[var(--tap)] w-full items-center gap-2 text-left pointer-fine:min-h-8"
      >
        <span className="eyebrow !text-[0.6875rem]" style={{ color: accent }}>
          Run
        </span>
        <span className="mono min-w-0 flex-1 truncate" style={{ color: 'var(--ink-3)' }}>
          {summary || 'answer'}
          {latency ? ` · ${(latency / 1000).toFixed(1)}s` : live ? ' · running' : ''}
        </span>
        <ChevronRight
          className="size-4 shrink-0 transition-transform duration-200"
          style={{ color: 'var(--ink-3)', transform: open ? 'rotate(90deg)' : undefined }}
          aria-hidden="true"
        />
      </button>
      <div className="run-steps">
        <RunSteps steps={steps} />
      </div>
    </div>
  );
}
