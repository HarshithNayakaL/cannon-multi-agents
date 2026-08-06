'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { AgentIcon } from '@/components/shell/agent-icon';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { AgentProfile } from '@/lib/agents/registry';

/**
 * Under 768px the rail becomes a bottom bar. It is one of the few surfaces
 * that genuinely floats over scrolling content, so it is one of the few that
 * earns a blur.
 */
export function MobileTabBar({ profiles }: { profiles: AgentProfile[] }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.replace('/signin');
    router.refresh();
  }

  return (
    <nav
      aria-label="Agent tabs"
      className="material fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-x-0 border-b-0 px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+0.375rem)] md:hidden"
    >
      {profiles.map((profile) => {
        const href = `/${profile.id}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={profile.id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)]"
            style={{ color: active ? profile.accent : 'var(--ink-3)' }}
          >
            <AgentIcon agent={profile.id} className="size-[17px]" />
            <span className="text-[0.625rem] font-medium">{profile.name}</span>
          </Link>
        );
      })}

      <span className="mx-1 h-7 w-px" style={{ background: 'var(--line)' }} aria-hidden="true" />
      <ThemeToggle className="size-9" />
      <button type="button" onClick={signOut} aria-label="Sign out" className="icon-btn size-9">
        <LogOut className="size-[15px]" />
      </button>
    </nav>
  );
}
