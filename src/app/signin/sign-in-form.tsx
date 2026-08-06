'use client';

import { ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function SignInForm({ openDemo, next }: { openDemo: boolean; next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(openDemo ? 'guest@cannon.dev' : '');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, passcode: passcode || undefined }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Could not sign in.');
        return;
      }

      const destination = next && next.startsWith('/') ? next : '/fitness';
      router.replace(destination);
      router.refresh();
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {openDemo ? (
        <p className="t-small mb-5 border-l-2 py-0.5 pl-3" style={{ borderColor: 'var(--accent)' }}>
          No passcode is configured on this deployment, so it runs as an open demo. Enter any email
          to look around.
        </p>
      ) : null}

      <label className="t-label mb-1.5 block" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        className="field mb-4"
      />

      {openDemo ? null : (
        <>
          <label className="t-label mb-1.5 block" htmlFor="passcode">
            Passcode
          </label>
          <input
            id="passcode"
            type="password"
            autoComplete="current-password"
            required
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="••••••••"
            className="field mb-4"
          />
        </>
      )}

      {error ? (
        <p
          role="alert"
          className="t-small mb-4 border-l-2 py-0.5 pl-3"
          style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}
        >
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Opening
          </>
        ) : (
          <>
            Enter Cannon
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
