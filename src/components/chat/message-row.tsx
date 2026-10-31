'use client';

import { isToolUIPart } from 'ai';

import { RunTrail } from '@/components/chat/run-trail';
import { ToolCallCard } from '@/components/chat/tool-call-card';
import type { CannonUIMessage } from '@/lib/agents/message';
import type { AgentProfile } from '@/lib/agents/registry';

export function MessageRow({
  message,
  profile,
  live = false,
}: {
  message: CannonUIMessage;
  profile: AgentProfile;
  /** The turn still streaming. */
  live?: boolean;
}) {
  if (message.role === 'user') return <UserMessage message={message} />;
  return <AssistantMessage message={message} profile={profile} live={live} />;
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
 * every message. Its run trail sits directly under the name.
 */
function AssistantMessage({
  message,
  profile,
  live,
}: {
  message: CannonUIMessage;
  profile: AgentProfile;
  live: boolean;
}) {
  return (
    <div className="enter">
      <div
        className="mb-1 text-[0.6875rem] font-semibold tracking-[0.01em]"
        style={{ color: profile.accent }}
      >
        {profile.name}
      </div>

      {/* What this turn did — retrieval, tools, the model that answered —
          collapsed to one line until asked. */}
      <div className="mb-3">
        <RunTrail message={message} accent={profile.accent} live={live} />
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
