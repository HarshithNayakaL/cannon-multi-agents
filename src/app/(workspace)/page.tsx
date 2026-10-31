import type { Metadata } from 'next';

import { DispatchConsole } from '@/components/dispatch/dispatch-console';
import { listProfiles } from '@/lib/agents/registry';
import { listModels } from '@/lib/ai/live-models';

export const metadata: Metadata = {
  title: 'Dispatch — Cannon',
  description:
    'State the job once. Cannon scores it against every desk and picks a model for the shape of the request — both shown before anything runs.',
};

/**
 * `availableModels()` reads the provider keys out of the environment, and on
 * Vercel those exist at request time, not at build time. Prerendered, this
 * page baked in the empty build environment and told every visitor that no
 * models were configured while the API happily answered on Groq. The roster
 * of created agents is a database read, which is equally not build-time.
 */
export const dynamic = 'force-dynamic';

/**
 * The root is dispatch rather than a redirect to one desk. Landing straight on
 * `/fitness` made a four-agent system look like a one-agent system with tabs.
 *
 * Both the profiles and the model list are resolved server-side: profiles so
 * the agents' system prompts and tool factories never enter the client bundle,
 * models so the catalog is filtered to what this deployment actually holds a
 * key for without the keys themselves going anywhere near the browser.
 */
export default async function DispatchRoute() {
  const [profiles, { models }] = await Promise.all([listProfiles(), listModels()]);
  return <DispatchConsole profiles={profiles} models={models} />;
}
