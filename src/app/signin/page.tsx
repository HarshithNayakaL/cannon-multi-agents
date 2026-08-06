import { redirect } from 'next/navigation';

import { SignInForm } from '@/app/signin/sign-in-form';
import { CanvasField } from '@/components/ui/canvas-field';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { agents, toProfile } from '@/lib/agents/registry';
import { AgentIcon } from '@/components/shell/agent-icon';
import { getSession } from '@/lib/auth/server';
import { describeCapabilities, readEnv } from '@/lib/env';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) redirect('/fitness');

  const { next } = await searchParams;
  const capabilities = describeCapabilities(readEnv());
  const profiles = agents.map(toProfile);

  return (
    <main className="scroll relative h-dvh w-full overflow-y-auto">
      <CanvasField />

      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle className="size-11" />
      </div>

      {/* Two columns on desktop: the pitch, then the door. Stacks on mobile
          so the form is never below a screenful of prose. */}
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[72rem] flex-col justify-center gap-12 px-6 py-16 lg:flex-row lg:items-center lg:gap-20 lg:px-10">
        <section className="enter flex-1">
          <div className="mb-8 flex items-center gap-3">
            <span
              className="card flex size-10 items-center justify-center !rounded-[var(--r-md)]"
              aria-hidden="true"
            >
              <span
                className="text-[1rem] font-semibold"
                style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}
              >
                C
              </span>
            </span>
            <span className="t-subtitle">Cannon</span>
          </div>

          <h1 className="t-display mb-6 max-w-[14ch]">A bureau, not a chatbot.</h1>

          <p className="t-body mb-10 max-w-[46ch]" style={{ color: 'var(--ink-2)' }}>
            Every domain gets a dedicated specialist — its own persona, its own tools, its own
            retrieval scope. Nothing here is a generalist wearing hats.
          </p>

          <ul className="grid gap-3 sm:grid-cols-2">
            {profiles.map((profile) => (
              <li key={profile.id} className="card p-5">
                <span
                  className="mb-4 flex size-9 items-center justify-center rounded-[var(--r-md)]"
                  style={{ background: profile.accentSoft, color: profile.accent }}
                  aria-hidden="true"
                >
                  <AgentIcon agent={profile.id} className="size-[18px]" />
                </span>
                <h2 className="t-subtitle mb-1">{profile.title}</h2>
                <p className="t-small">{profile.tagline}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="enter w-full lg:max-w-[24rem]">
          <div className="card p-7 sm:p-8">
            <h2 className="t-subtitle mb-6">Sign in</h2>
            <SignInForm openDemo={capabilities.demoMode} next={next} />
          </div>

          {/* The deployment states which backends are live rather than
              implying capabilities it does not have. */}
          <dl className="mt-6 grid grid-cols-3 gap-4 px-1">
            <Capability label="inference" value={capabilities.inference} />
            <Capability label="storage" value={capabilities.storage} />
            <Capability label="vectors" value={capabilities.embeddings} />
          </dl>
        </section>
      </div>
    </main>
  );
}

function Capability({ label, value }: { label: string; value: string }) {
  const live = value !== 'simulated' && value !== 'memory' && value !== 'local';
  return (
    <div>
      <dt className="t-label mb-1.5">{label}</dt>
      <dd className="status" style={{ color: 'var(--ink-2)' }}>
        <span
          className="dot"
          style={{ background: live ? 'var(--good)' : 'var(--idle)' }}
          aria-hidden="true"
        />
        {value}
      </dd>
    </div>
  );
}
