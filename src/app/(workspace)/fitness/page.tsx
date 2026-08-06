import type { Metadata } from 'next';

import { AgentWorkspace } from '@/components/chat/agent-workspace';
import { getAgent, toProfile } from '@/lib/agents/registry';
import { describeCapabilities } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Fitness Agent — Cannon',
};

export default function FitnessPage() {
  return (
    <AgentWorkspace
      profile={toProfile(getAgent('fitness'))}
      capabilities={describeCapabilities()}
    />
  );
}
