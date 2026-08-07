import type { Metadata } from 'next';

import { AgentPage, type PageSearchParams } from '@/components/chat/agent-page';

export const metadata: Metadata = {
  title: 'Fitness Agent — Cannon',
};

export default function FitnessRoute({ searchParams }: { searchParams: PageSearchParams }) {
  return <AgentPage agent="fitness" searchParams={searchParams} />;
}
