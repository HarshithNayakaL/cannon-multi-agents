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
    <form onSubmit={submit} className="ask flex items-end gap-2 p-1.5">
      <textarea
        ref={textarea}
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label="Message the agent"
        className="scroll max-h-[176px] min-h-[var(--tap)] flex-1 resize-none bg-transparent px-3 py-[0.6rem] text-[1rem] leading-relaxed outline-none focus-visible:outline-none"
      />

      {busy ? (
        <button
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onStop}
          aria-label="Stop generating"
          className="btn btn-quiet btn-round"
        >
          <Square className="size-3.5" style={{ fill: 'currentColor' }} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="submit"
          // Keep focus — and the keyboard — in the field. Letting the tap move
          // focus to the button closed the keyboard mid-tap on a phone, the
          // layout jumped, and the click landed on whatever slid under it.
          onPointerDown={(event) => event.preventDefault()}
          disabled={value.trim().length === 0}
          aria-label="Send message"
          className="btn btn-primary btn-round"
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
