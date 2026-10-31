'use client';

import { Compass, LayoutGrid, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { AgentIcon } from '@/components/shell/agent-icon';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { AgentProfile } from '@/lib/agents/registry';

/** Desks shown directly in the bar. The rest live in the "All" sheet. */
const VISIBLE_DESKS = 3;

/**
 * Under 768px the rail becomes a bottom bar. It is one of the few surfaces
 * that genuinely floats over scrolling content, so it is one of the few that
 * earns a blur.
 *
 * The bar holds five slots and never more: Dispatch, three desks, and "All".
 * The roster is open — anyone can create an agent by typing — so mapping every
 * profile into the bar meant a sixth desk squeezed each tab under a usable
 * width. The active desk always takes a slot, even when it is not one of the
 * first three, so the bar never hides where you are.
 *
 * It steps aside while the keyboard is open (`--tabbar-h` drops to zero), so
 * it can never sit between a text field and the keys.
 */
export function MobileTabBar({ profiles }: { profiles: AgentProfile[] }) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const active = profiles.find((profile) => pathname.startsWith(`/${profile.id}`));
  const visible = profiles.slice(0, VISIBLE_DESKS);
  if (active && !visible.includes(active)) visible[VISIBLE_DESKS - 1] = active;

  const overflowActive = active !== undefined && !profiles.slice(0, VISIBLE_DESKS).includes(active);

  return (
    <>
      <nav
        aria-label="Agent tabs"
        className="tabbar material fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-0.5 !rounded-none border-x-0 border-b-0 px-1.5 pt-1 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] md:hidden"
      >
        <TabLink href="/" label="Dispatch" active={pathname === '/'} accent="var(--accent)">
          <Compass className="size-5" aria-hidden="true" />
        </TabLink>

        {visible.map((profile) => (
          <TabLink
            key={profile.id}
            href={`/${profile.id}`}
            label={profile.name}
            active={profile === active}
            accent={profile.accent}
          >
            <AgentIcon agent={profile.id} label={profile.name} className="size-5" />
          </TabLink>
        ))}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className="tab"
          style={{ color: overflowActive ? 'var(--ink)' : 'var(--ink-3)' }}
          data-testid="tabbar-all"
        >
          <LayoutGrid className="size-5" aria-hidden="true" />
          <span className="tab-label">All</span>
        </button>
      </nav>

      {sheetOpen ? (
        <DeskSheet profiles={profiles} pathname={pathname} onClose={() => setSheetOpen(false)} />
      ) : null}
    </>
  );
}

function TabLink({
  href,
  label,
  active,
  accent,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="tab"
      style={{ color: active ? accent : 'var(--ink-3)' }}
    >
      {/* The active desk gets a pill behind its glyph, the shape iOS and
          Material both settled on: colour alone is a weak signal at 20px. */}
      <span
        className="tab-pill"
        style={active ? { background: 'color-mix(in oklab, currentColor 16%, transparent)' } : {}}
      >
        {children}
      </span>
      <span className="tab-label" style={active ? { color: 'var(--ink)' } : undefined}>
        {label}
      </span>
    </Link>
  );
}

/**
 * Every desk, as a sheet. Also where the theme toggle lives on a phone — it
 * is a once-a-month setting, and it was occupying a sixth of the tab bar.
 */
export function DeskSheet({
  profiles,
  pathname,
  onClose,
}: {
  profiles: AgentProfile[];
  pathname: string;
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="All desks"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="fade absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      />
      <div
        className="sheet absolute inset-x-0 bottom-0 flex max-h-[84dvh] flex-col overflow-hidden rounded-t-[var(--r-xl)] border-t"
        style={{
          background: 'var(--bg-panel)',
          borderColor: 'var(--line-strong)',
          boxShadow: 'var(--e-3)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div
          className="mx-auto mt-2 h-1 w-9 rounded-full"
          style={{ background: 'var(--line-strong)' }}
          aria-hidden="true"
        />
        <div className="flex items-center gap-2 px-4 pt-2 pb-1">
          <h2 className="t-subtitle flex-1">All desks</h2>
          <ThemeToggle />
          <button type="button" onClick={onClose} aria-label="Close" className="icon-btn" autoFocus>
            <X className="size-[18px]" />
          </button>
        </div>

        <ul className="scroll grid grid-cols-1 gap-1 overflow-y-auto px-2 pb-4 min-[420px]:grid-cols-2">
          <li>
            <SheetLink
              href="/"
              label="Dispatch"
              note="Route a request"
              active={pathname === '/'}
              accent="var(--accent)"
              accentSoft="var(--accent-soft)"
              onNavigate={onClose}
            >
              <Compass className="size-5" aria-hidden="true" />
            </SheetLink>
          </li>
          {profiles.map((profile) => (
            <li key={profile.id}>
              <SheetLink
                href={`/${profile.id}`}
                label={profile.name}
                note={profile.tagline}
                active={pathname.startsWith(`/${profile.id}`)}
                accent={profile.accent}
                accentSoft={profile.accentSoft}
                onNavigate={onClose}
              >
                <AgentIcon agent={profile.id} label={profile.name} className="size-5" />
              </SheetLink>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}

function SheetLink({
  href,
  label,
  note,
  active,
  accent,
  accentSoft,
  onNavigate,
  children,
}: {
  href: string;
  label: string;
  note: string;
  active: boolean;
  accent: string;
  accentSoft: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className="lift flex min-h-[56px] items-center gap-3 rounded-[var(--r-md)] px-3 py-2"
      style={active ? { background: accentSoft } : undefined}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-[var(--r-md)]"
        style={{ background: accentSoft, color: accent }}
        aria-hidden="true"
      >
        {children}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-medium">{label}</span>
        <span className="t-label block truncate">{note}</span>
      </span>
    </Link>
  );
}
