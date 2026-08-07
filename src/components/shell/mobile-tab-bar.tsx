'use client';

import { Compass } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AgentIcon } from '@/components/shell/agent-icon';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { AgentProfile } from '@/lib/agents/registry';

/**
 * Under 768px the rail becomes a bottom bar. It is one of the few surfaces
 * that genuinely floats over scrolling content, so it is one of the few that
 * earns a blur.
 *
 * Five destinations plus the theme toggle is the ceiling for this width. The
 * labels truncate rather than wrap: a tab bar that changes height when a label
 * runs to two lines shifts the whole page under it.
 */
export function MobileTabBar({ profiles }: { profiles: AgentProfile[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Agent tabs"
      className="material fixed inset-x-0 bottom-0 z-30 flex items-center gap-0.5 border-x-0 border-b-0 px-1.5 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] md:hidden"
    >
      <TabLink href="/" label="Dispatch" active={pathname === '/'} accent="var(--accent)">
        <Compass className="size-[17px]" aria-hidden="true" />
      </TabLink>

      {profiles.map((profile) => (
        <TabLink
          key={profile.id}
          href={`/${profile.id}`}
          label={profile.name}
          active={pathname.startsWith(`/${profile.id}`)}
          accent={profile.accent}
        >
          <AgentIcon agent={profile.id} label={profile.name} className="size-[17px]" />
        </TabLink>
      ))}

      <ThemeToggle className="ml-0.5 size-9 shrink-0" />
    </nav>
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
      className="flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)]"
      style={{ color: active ? accent : 'var(--ink-3)' }}
    >
      {children}
      <span className="w-full truncate text-center text-[0.625rem] font-medium">{label}</span>
    </Link>
  );
}
