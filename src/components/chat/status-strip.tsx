'use client';

import { RefreshCw } from 'lucide-react';

/** Streaming indicator: three ticks and a word. No spinner, no skeleton. */
export function StreamingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pl-4" role="status" aria-live="polite">
      <span className="flex gap-1" aria-hidden="true">
        <span className="tick" />
        <span className="tick" style={{ animationDelay: '0.15s' }} />
        <span className="tick" style={{ animationDelay: '0.3s' }} />
      </span>
      <span className="mono" style={{ color: 'var(--ink-3)' }}>
        {label}
      </span>
    </div>
  );
}

/**
 * Errors get their own state in the transcript. A failed call must never look
 * like a silent hang or a generic toast that hides what actually broke.
 */
export function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="enter flex flex-col gap-3 border-l-2 py-1 pl-4 sm:flex-row sm:items-center"
      style={{ borderColor: 'var(--bad)' }}
      role="alert"
    >
      <div className="flex-1">
        <div className="mono mb-0.5" style={{ color: 'var(--bad)' }}>
          request failed
        </div>
        <p className="t-small">{message}</p>
      </div>
      <button type="button" onClick={onRetry} className="btn btn-quiet h-8 min-h-0 shrink-0">
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
