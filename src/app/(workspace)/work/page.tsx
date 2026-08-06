import type { Metadata } from 'next';

import { AgentWorkspace } from '@/components/chat/agent-workspace';
import { getAgent, toProfile } from '@/lib/agents/registry';
import { describeCapabilities } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Work Agent — Cannon',
};

export default function WorkPage() {
  return (
    <AgentWorkspace profile={toProfile(getAgent('work'))} capabilities={describeCapabilities()} />
  );
}
