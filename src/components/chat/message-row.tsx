'use client';

import { isToolUIPart } from 'ai';

import { ToolCallCard } from '@/components/chat/tool-call-card';
import type { CannonUIMessage } from '@/lib/agents/message';
import type { AgentProfile } from '@/lib/agents/registry';

export function MessageRow({
  message,
  profile,
}: {
  message: CannonUIMessage;
  profile: AgentProfile;
}) {
  if (message.role === 'user') return <UserMessage message={message} />;
  return <AssistantMessage message={message} profile={profile} />;
}

/**
 * The user's turn is set right and quiet: a subtle surface, no border, no
 * accent fill. It is a reference point in the scroll, not the subject.
 */
function UserMessage({ message }: { message: CannonUIMessage }) {
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');

  if (text.trim().length === 0) return null;

  return (
    <div className="enter flex justify-end">
      <div
        className="max-w-[min(42rem,90%)] rounded-[var(--r-lg)] px-3.5 py-2.5 sm:px-4"
        style={{ background: 'var(--bg-raise)' }}
      >
        <p className="t-body whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

/**
 * The agent's turn runs full measure with a hairline gutter rule in the
 * agent's accent — enough to attribute the voice without an avatar chip on
 * every message.
 */
function AssistantMessage({
  message,
  profile,
}: {
  message: CannonUIMessage;
  profile: AgentProfile;
}) {
  const meta = message.metadata;

  return (
    <div className="enter border-l-2 pl-3.5 sm:pl-5" style={{ borderColor: profile.accent }}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span
          className="text-[0.6875rem] font-semibold tracking-[0.01em]"
          style={{ color: profile.accent }}
        >
          {profile.name}
        </span>
        {meta?.simulated ? (
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            simulated
          </span>
        ) : null}
        {meta?.fallbacks && meta.fallbacks.length > 0 ? (
          <span
            className="mono"
            style={{ color: 'var(--warn)' }}
            title={meta.fallbacks.map((event) => `${event.from} → ${event.to}`).join(', ')}
          >
            fallback fired
          </span>
        ) : null}
        {meta?.latencyMs ? (
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            {(meta.latencyMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>

      <div className="space-y-4">
        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            if (part.text.trim().length === 0) return null;
            return (
              <p
                key={`${message.id}-text-${index}`}
                className="t-body max-w-[62ch] whitespace-pre-wrap"
              >
                {part.text}
              </p>
            );
          }

          if (part.type === 'dynamic-tool' || isToolUIPart(part)) {
            return <ToolCallCard key={`${message.id}-tool-${index}`} part={part} />;
          }

          return null;
        })}
      </div>
    </div>
  );
}
