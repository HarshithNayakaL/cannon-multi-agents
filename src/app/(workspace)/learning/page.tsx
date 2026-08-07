import type { Metadata } from 'next';

import { AgentPage, type PageSearchParams } from '@/components/chat/agent-page';

export const metadata: Metadata = {
  title: 'Learning Agent — Cannon',
};

export default function LearningRoute({ searchParams }: { searchParams: PageSearchParams }) {
  return <AgentPage agent="learning" searchParams={searchParams} />;
}
