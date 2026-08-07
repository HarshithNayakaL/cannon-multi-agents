import { AgentWorkspace } from '@/components/chat/agent-workspace';
import { getAgent, toProfile } from '@/lib/agents/registry';
import type { AgentId } from '@/lib/agents/types';
import { availableModels } from '@/lib/ai/provider';
import { describeCapabilities } from '@/lib/env';

export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Query strings arrive as `string | string[]`; only a single value is meaningful here. */
function one(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  if (Array.isArray(value)) return one(value[0]);
  return undefined;
}

/**
 * The four desks differ only by id, so they share one server component rather
 * than four copies of the same wiring. Each route file stays a thin shell that
 * owns its own `metadata`, which is the one thing Next needs stated statically.
 *
 * `availableModels()` is resolved here, on the server: the picker must list
 * what this deployment actually holds a key for, and the keys themselves never
 * cross into the browser.
 */
export async function AgentPage({
  agent,
  searchParams,
}: {
  agent: AgentId;
  searchParams?: PageSearchParams;
}) {
  const params = searchParams ? await searchParams : {};

  return (
    <AgentWorkspace
      profile={toProfile(getAgent(agent))}
      capabilities={describeCapabilities()}
      models={availableModels()}
      initialQuery={one(params.q)}
      initialModel={one(params.model)}
    />
  );
}
