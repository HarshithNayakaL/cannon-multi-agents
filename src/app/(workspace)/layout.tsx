import { AgentRail } from '@/components/shell/agent-rail';
import { MobileTabBar } from '@/components/shell/mobile-tab-bar';
import { CanvasField } from '@/components/ui/canvas-field';
import { listProfiles } from '@/lib/agents/registry';

/** The rail lists created agents, which live in the database. */
export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const profiles = await listProfiles();

  return (
    <div className="relative flex h-dvh w-full overflow-hidden">
      <CanvasField />
      <AgentRail profiles={profiles} />
      {children}
      <MobileTabBar profiles={profiles} />
    </div>
  );
}
