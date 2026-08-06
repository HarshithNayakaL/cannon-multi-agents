import { Briefcase, Dumbbell } from 'lucide-react';

import type { AgentId } from '@/lib/agents/types';

const ICONS = {
  fitness: Dumbbell,
  work: Briefcase,
} as const;

export function AgentIcon({ agent, className }: { agent: AgentId; className?: string }) {
  const Icon = ICONS[agent];
  return <Icon className={className} aria-hidden="true" />;
}
