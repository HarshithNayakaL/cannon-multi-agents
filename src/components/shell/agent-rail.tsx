'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { AgentIcon } from '@/components/shell/agent-icon';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import type { AgentProfile } from '@/lib/agents/registry';

/**
 * Explicit agent selection — v1 has no auto-router by design, so the rail is
 * the routing model, not a shortcut for one.
 *
 * The active desk gets a tinted, rounded surface in its own accent — the web
 * equivalent of Apple's tinted interactive glass — rather than a bare
 * highlight, so the selection reads as a physical resting place.
 */
export function AgentRail({ profiles, email }: { profiles: AgentProfile[]; email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch('/api/auth/session', { method: 'DELETE' });
    router.replace('/signin');
    router.refresh();
  }

  return (
    <nav
      aria-label="Agent rail"
      className="relative z-20 hidden w-[88px] shrink-0 flex-col items-center gap-2 border-r py-5 md:flex"
      style={{ borderColor: 'var(--line)', background: 'var(--bg-panel)' }}
    >
      <Link
        href="/fitness"
        aria-label="Cannon home"
        className="icon-btn mb-4 size-10 !rounded-[var(--r-md)]"
        style={{ border: '1px solid var(--line-strong)' }}
      >
        <span
          className="text-[0.9375rem] font-semibold"
          style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}
        >
          C
        </span>
      </Link>

      {profiles.map((profile) => {
        const href = `/${profile.id}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={profile.id}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="lift flex w-[68px] flex-col items-center gap-1.5 rounded-[var(--r-lg)] py-3.5"
            style={
              active
                ? { background: profile.accentSoft, color: profile.accent }
                : { color: 'var(--ink-3)' }
            }
          >
            <AgentIcon agent={profile.id} className="size-5" />
            <span className="text-[0.6875rem] font-medium tracking-[-0.006em]">{profile.name}</span>
          </Link>
        );
      })}

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <ThemeToggle className="size-10" />
        <button
          type="button"
          onClick={signOut}
          title={`Sign out ${email}`}
          aria-label={`Sign out ${email}`}
          className="icon-btn size-10"
        >
          <LogOut className="size-[17px]" />
        </button>
      </div>
    </nav>
  );
}
