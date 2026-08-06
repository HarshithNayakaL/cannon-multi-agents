'use client';

import { getToolName, type DynamicToolUIPart, type ToolUIPart } from 'ai';
import { useState } from 'react';

import { MacroCard, ProgressCard, WorkoutLoggedCard } from '@/components/data/fitness-cards';
import {
  NotesSummaryCard,
  TaskCreatedCard,
  TaskListCard,
  TaskUpdatedCard,
} from '@/components/data/work-cards';
import { isCannonToolResult, type CannonToolResult } from '@/lib/agents/tool-results';

type Part = ToolUIPart | DynamicToolUIPart;

/**
 * A tool call is a first-class event in the transcript, not a hidden
 * implementation detail: the user sees the call go out, sees it land, and gets
 * the result rendered as real data rather than pasted JSON.
 *
 * The chrome is deliberately thin — a status dot, the tool name in mono, and a
 * hairline. The data inside is what deserves the attention.
 */
export function ToolCallCard({ part }: { part: Part }) {
  const [showInput, setShowInput] = useState(false);
  const name = getToolName(part);
  const running = part.state === 'input-streaming' || part.state === 'input-available';
  const failed = part.state === 'output-error';

  const tone = failed ? 'var(--bad)' : running ? 'var(--accent)' : 'var(--good)';

  return (
    <div
      className="card enter relative overflow-hidden"
      data-testid="tool-call"
      data-tool={name}
      data-state={part.state}
    >
      {running ? <span className="scan" aria-hidden="true" /> : null}

      <div
        className="flex items-center gap-2.5 border-b px-5 py-3.5"
        style={{ borderColor: 'var(--line)' }}
      >
        <span className="dot" style={{ background: tone }} aria-hidden="true" />
        <span className="mono min-w-0 flex-1 truncate" style={{ color: 'var(--ink-2)' }}>
          {name}
        </span>

        {running ? (
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            running
          </span>
        ) : part.input !== undefined ? (
          <button
            type="button"
            onClick={() => setShowInput((open) => !open)}
            aria-expanded={showInput}
            className="mono lift rounded-[var(--r-sm)] px-1.5 py-0.5"
            style={{ color: 'var(--ink-3)' }}
          >
            {showInput ? 'hide input' : 'input'}
          </button>
        ) : null}
      </div>

      {showInput && part.input !== undefined ? (
        <pre
          className="scroll mono max-h-40 overflow-auto border-b px-5 py-4 leading-relaxed"
          style={{
            borderColor: 'var(--line)',
            background: 'var(--bg-sunken)',
            color: 'var(--ink-2)',
          }}
        >
          {JSON.stringify(part.input, null, 2)}
        </pre>
      ) : null}

      {failed ? (
        <p className="t-small px-5 py-4" style={{ color: 'var(--bad)' }}>
          {part.errorText ?? 'The tool call failed.'}
        </p>
      ) : null}

      {part.state === 'output-available' ? (
        <div className="p-5 sm:p-6">
          <ToolResultView output={part.output} />
        </div>
      ) : null}
    </div>
  );
}

function ToolResultView({ output }: { output: unknown }) {
  if (!isCannonToolResult(output)) {
    return (
      <pre
        className="scroll mono max-h-52 overflow-auto leading-relaxed"
        style={{ color: 'var(--ink-2)' }}
      >
        {JSON.stringify(output, null, 2)}
      </pre>
    );
  }

  const result = output as CannonToolResult;

  switch (result.kind) {
    case 'workout-logged':
      return <WorkoutLoggedCard result={result} />;
    case 'progress-summary':
      return <ProgressCard result={result} />;
    case 'macros':
      return <MacroCard result={result} />;
    case 'task-created':
      return <TaskCreatedCard result={result} />;
    case 'task-list':
      return <TaskListCard result={result} />;
    case 'task-updated':
      return <TaskUpdatedCard result={result} />;
    case 'notes-summary':
      return <NotesSummaryCard result={result} />;
  }
}
