import { redirect } from 'next/navigation';

import { AgentRail } from '@/components/shell/agent-rail';
import { MobileTabBar } from '@/components/shell/mobile-tab-bar';
import { CanvasField } from '@/components/ui/canvas-field';
import { agents, toProfile } from '@/lib/agents/registry';
import { getSession } from '@/lib/auth/server';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/signin');

  const profiles = agents.map(toProfile);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden">
      <CanvasField />
      <AgentRail profiles={profiles} email={session.email} />
      {children}
      <MobileTabBar profiles={profiles} />
    </div>
  );
}
