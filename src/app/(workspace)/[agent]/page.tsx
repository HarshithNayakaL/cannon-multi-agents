import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AgentWorkspace } from '@/components/chat/agent-workspace';
import { listProfiles, resolveAgent, toProfile } from '@/lib/agents/registry';
import { listModels } from '@/lib/ai/live-models';
import { describeCapabilities } from '@/lib/env';

/**
 * One dynamic segment rather than a file per desk. The roster is open — an
 * agent can be created at runtime — so there is no set of routes to enumerate
 * at build time.
 */
export const dynamic = 'force-dynamic';

type Params = Promise<{ agent: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

/** Query strings arrive as `string | string[]`; only a single value is meaningful. */
function one(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  if (Array.isArray(value)) return one(value[0]);
  return undefined;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { agent: id } = await params;
  const agent = await resolveAgent(id);
  return { title: agent ? `${agent.title} — Cannon` : 'Unknown agent — Cannon' };
}

export default async function AgentRoute({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { agent: id } = await params;
  const agent = await resolveAgent(id);
  if (!agent) notFound();

  const search = await searchParams;
  const [{ models }, profiles] = await Promise.all([listModels(), listProfiles()]);

  return (
    <AgentWorkspace
      profile={toProfile(agent)}
      profiles={profiles}
      capabilities={describeCapabilities()}
      models={models}
      initialQuery={one(search.q)}
      initialModel={one(search.model)}
    />
  );
}
