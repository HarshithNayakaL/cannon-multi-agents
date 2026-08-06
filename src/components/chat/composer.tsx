'use client';

import { ArrowUp, Square } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

const MAX_HEIGHT_PX = 176;

export function Composer({
  onSend,
  onStop,
  busy,
  placeholder,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  placeholder: string;
}) {
  const [value, setValue] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Grow with content up to a ceiling, then scroll internally.
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = value.trim();
    if (text.length === 0 || busy) return;
    onSend(text);
    setValue('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="material flex items-end gap-2 !rounded-[var(--r-xl)] p-2.5">
      <textarea
        ref={textarea}
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Message the agent"
        className="scroll max-h-[176px] min-h-[36px] flex-1 resize-none bg-transparent px-3 py-2 text-[1rem] leading-relaxed outline-none"
      />

      {busy ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop generating"
          className="btn btn-quiet size-10 min-h-0 shrink-0 !px-0"
        >
          <Square className="size-3.5" style={{ fill: 'currentColor' }} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={value.trim().length === 0}
          aria-label="Send message"
          className="btn btn-primary size-10 min-h-0 shrink-0 !px-0"
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
