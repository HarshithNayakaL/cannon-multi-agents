import type { Metadata } from 'next';

import { AgentPage, type PageSearchParams } from '@/components/chat/agent-page';

export const metadata: Metadata = {
  title: 'Finance Agent — Cannon',
};

export default function FinanceRoute({ searchParams }: { searchParams: PageSearchParams }) {
  return <AgentPage agent="finance" searchParams={searchParams} />;
}
