import type { Metadata } from 'next';

import { AgentPage, type PageSearchParams } from '@/components/chat/agent-page';

export const metadata: Metadata = {
  title: 'Work Agent — Cannon',
};

export default function WorkRoute({ searchParams }: { searchParams: PageSearchParams }) {
  return <AgentPage agent="work" searchParams={searchParams} />;
}
