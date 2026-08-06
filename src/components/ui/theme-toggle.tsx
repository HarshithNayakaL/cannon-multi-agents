'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

/**
 * The `data-theme` attribute on <html> is the single source of truth — it is
 * set before first paint by the bootstrap script, so React subscribes to it
 * rather than keeping a competing copy in state.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function getServerSnapshot(): Theme {
  return 'dark';
}

export function ThemeToggle({ className = 'size-8' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('cannon-theme', next);
    } catch {
      // Private browsing — the theme simply will not persist.
    }
  }

  const Icon = theme === 'dark' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className={`icon-btn ${className}`}
    >
      <Icon className="size-[15px]" />
    </button>
  );
}
