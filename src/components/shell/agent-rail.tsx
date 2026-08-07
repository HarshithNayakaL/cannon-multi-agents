'use client';

import { Compass } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AgentIcon } from '@/components/shell/agent-icon';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { AgentProfile } from '@/lib/agents/registry';

/**
 * Explicit agent selection. Dispatch sits at the top as the way in when you do
 * not already know which desk you want; the rail below it is the way in when
 * you do. There is no auto-router in the request path by design — dispatch
 * recommends, the user commits.
 *
 * The active desk gets a tinted, rounded surface in its own accent — the web
 * equivalent of Apple's tinted interactive glass — rather than a bare
 * highlight, so the selection reads as a physical resting place.
 */
export function AgentRail({ profiles }: { profiles: AgentProfile[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Agent rail"
      className="relative z-20 hidden w-[88px] shrink-0 flex-col items-center gap-1.5 border-r py-5 md:flex"
      style={{ borderColor: 'var(--line)', background: 'var(--bg-panel)' }}
    >
      <RailLink
        href="/"
        label="Dispatch"
        // Exact match only: every agent route also starts with "/".
        active={pathname === '/'}
        accent="var(--accent)"
        accentSoft="var(--accent-soft)"
      >
        <Compass className="size-5" aria-hidden="true" />
      </RailLink>

      <span className="my-1.5 h-px w-9" style={{ background: 'var(--line)' }} aria-hidden="true" />

      {profiles.map((profile) => (
        <RailLink
          key={profile.id}
          href={`/${profile.id}`}
          label={profile.name}
          active={pathname.startsWith(`/${profile.id}`)}
          accent={profile.accent}
          accentSoft={profile.accentSoft}
        >
          <AgentIcon agent={profile.id} label={profile.name} className="size-5" />
        </RailLink>
      ))}

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <ThemeToggle className="size-10" />
      </div>
    </nav>
  );
}

function RailLink({
  href,
  label,
  active,
  accent,
  accentSoft,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  accent: string;
  accentSoft: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="lift flex w-[68px] flex-col items-center gap-1.5 rounded-[var(--r-lg)] py-3"
      style={active ? { background: accentSoft, color: accent } : { color: 'var(--ink-3)' }}
    >
      {children}
      <span className="text-[0.6875rem] font-medium">{label}</span>
    </Link>
  );
}
