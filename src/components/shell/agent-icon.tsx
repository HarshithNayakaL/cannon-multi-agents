import { Briefcase, Dumbbell, GraduationCap, Wallet, type LucideIcon } from 'lucide-react';

import type { AgentId } from '@/lib/agents/types';

const BUILTIN: Record<string, LucideIcon> = {
  fitness: Dumbbell,
  work: Briefcase,
  finance: Wallet,
  learning: GraduationCap,
};

/**
 * Created agents get an initial rather than a glyph.
 *
 * The alternative — guessing an icon from the agent's name against a fixed
 * Lucide set — is wrong most of the time, and a wrong icon reads as a bug in a
 * way a plain letter never does. The letter is set in the agent's own accent,
 * so the rail still distinguishes desks at a glance.
 */
export function AgentIcon({
  agent,
  label,
  className,
}: {
  agent: AgentId;
  /** The agent's display name. Only needed for created agents. */
  label?: string;
  className?: string;
}) {
  const Icon = BUILTIN[agent];
  if (Icon) return <Icon className={className} aria-hidden="true" />;

  const initial = (label ?? agent).trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      className={`inline-flex items-center justify-center font-semibold ${className ?? ''}`}
      style={{ fontSize: '0.8em', lineHeight: 1 }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
