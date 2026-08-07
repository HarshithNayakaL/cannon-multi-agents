import { Briefcase, Dumbbell, GraduationCap, Wallet } from 'lucide-react';

import type { AgentId } from '@/lib/agents/types';

const ICONS = {
  fitness: Dumbbell,
  work: Briefcase,
  finance: Wallet,
  learning: GraduationCap,
} as const;

export function AgentIcon({ agent, className }: { agent: AgentId; className?: string }) {
  const Icon = ICONS[agent];
  return <Icon className={className} aria-hidden="true" />;
}
