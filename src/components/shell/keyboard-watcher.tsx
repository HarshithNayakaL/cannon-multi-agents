'use client';

import { useEffect } from 'react';

/**
 * Marks <html data-keyboard="open"> while the on-screen keyboard is up.
 *
 * The bottom tab bar is fixed to the layout viewport, so when a phone keyboard
 * opens it rides up on top of it and covers whatever the user was typing
 * next to — the composer, the dispatch field, the first suggestion. CSS has
 * no reliable "keyboard open" query, but the visual viewport shrinking well
 * below the layout viewport while a text field has focus is that signal.
 *
 * The attribute zeroes `--tabbar-h`, which hides the bar and lets everything
 * that reserved space for it drop down onto the keyboard.
 */
export function KeyboardWatcher() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;

    function typing(): boolean {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return active.matches('input, textarea, [contenteditable="true"]');
    }

    function update() {
      const shrunk = viewport ? viewport.height < window.innerHeight * 0.8 : false;
      // Focus alone is enough on touch: some browsers resize the layout
      // viewport with the keyboard, so the two heights never diverge.
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      const open = typing() && (shrunk || coarse);
      if (open) root.dataset.keyboard = 'open';
      else delete root.dataset.keyboard;
    }

    // Focus hops between fields (or briefly to <body>) are not the keyboard
    // closing; settling for a beat stops the layout jolting on each hop.
    let timer: ReturnType<typeof setTimeout> | undefined;
    function settle() {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    }

    viewport?.addEventListener('resize', settle);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', settle);
    return () => {
      clearTimeout(timer);
      viewport?.removeEventListener('resize', settle);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', settle);
      delete root.dataset.keyboard;
    };
  }, []);

  return null;
}
