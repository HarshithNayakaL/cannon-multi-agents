# Cannon

A personal multi-agent assistant where each domain gets a dedicated specialist — its own persona, its own system prompt, its own tools and its own retrieval scope — instead of one generalist chatbot wearing hats.

Built to be used daily, not demoed once. The fitness desk holds real training data; the work desk holds a real task board. The portfolio artifact is a by-product of a tool that had to exist anyway.

> **Cannon is domain specialisation, not task orchestration.** Its sibling project, Maestro, splits a _single_ task across collaborating roles (Thinker / Worker / Verifier / Synthesiser). Cannon runs _independent_ experts that share infrastructure and deliberately do not share context. Different architecture, different problem.

---

## What is actually interesting here

**1. Agent isolation is enforced at the query, not by convention.**
The fitness agent cannot read work documents even by accident. Retrieval takes the agent id as an argument and the Postgres function filters on it internally — there is no post-filter a caller can forget. In the memory store the same boundary is a `WHERE` on the scan, and both paths are unit-tested with mirror-image queries.

**2. Provider fallback is a model, not a `try/catch`.**
`createFallbackModel` implements the AI SDK's provider interface and wraps Groq → Gemini. `streamText`, tool execution and the UI stream protocol are all unaware a swap happened. It covers two distinct failure modes: the call that never connects, and the call that connects then errors before emitting content. Once real content is flowing, a mid-stream failure is _surfaced_ rather than silently restarted — re-running a partially executed tool chain is worse than a visible error.

**3. Every external dependency has a working fallback.**
No provider key, no database, no Redis? The app still boots, builds, passes its whole test suite and serves a browsable demo. Inference falls back to a scripted model that implements the real provider interface, embeddings fall back to a deterministic lexical embedder, storage falls back to a process-local store, rate limiting falls back to an in-process window. This is why the public deployment is browsable and why CI can run end-to-end tests with zero secrets — the tests exercise the production code path, not a mocked-out shortcut.

**4. The Prompt Inspector.**
A docked panel showing the live system prompt driving the active agent, the tool signatures in scope, which provider answered, whether a fallback fired, and the exact chunks retrieval pulled with their similarity scores. It is a genuine debugging aid — and it makes the prompt engineering legible to anyone reading the repo.

**5. Tool results are data, not pasted JSON.**
Every tool returns a tagged, typed result that the chat surface renders as a real card: an RPE meter and a next-load recommendation for a logged set, a volume sparkline and a trend verdict for a progress query, a filterable board with a slipping banner for the work agent.

---

## Architecture

```
                        ┌──────────────────────────┐
                        │   Next.js 16 (Vercel)     │
                        │   App Router · RSC        │
                        └────────────┬──────────────┘
                                     │
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
         ┌───────▼───────┐  ┌────────▼────────┐  ┌───────▼────────┐
         │  Session gate  │  │  Agent registry  │  │  UI shell      │
         │  jose JWT +    │  │  explicit tab    │  │  chat + prompt │
         │  allowlist     │  │  routing (v1)    │  │  inspector     │
         └────────────────┘  └────────┬─────────┘  └────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                     │
           ┌────────▼─────────┐                 ┌─────────▼────────┐
           │  Fitness Agent    │                 │   Work Agent      │
           │  own prompt       │                 │   own prompt      │
           │  3 tools · RAG    │                 │   4 tools · RAG   │
           └────────┬──────────┘                 └─────────┬─────────┘
                    │                                      │
          ┌─────────▼──────────────────────────────────────▼─────────┐
          │  Shared infra                                             │
          │  Groq → Gemini fallback chain (provider-level)            │
          │  Gemini embeddings → local embedder fallback              │
          │  Supabase Postgres + pgvector → memory store fallback     │
          │  Upstash Redis → in-process limiter fallback              │
          └───────────────────────────────────────────────────────────┘
```

---

## The agents

|                     | Fitness                                                                                   | Work                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Persona**         | Direct, data-driven coach. Number first, then the recommendation. No motivational filler. | Efficient chief of staff. Prioritisation first, terse status, leads with what is at risk. |
| **Tools**           | `log_workout`, `get_progress_summary`, `calculate_macros`                                 | `create_task`, `list_tasks`, `update_task_status`, `summarize_notes`                      |
| **Retrieval**       | workout log · training principles                                                         | project notes · operating notes                                                           |
| **Structured data** | `workouts`, `body_metrics`                                                                | `tasks`, `notes`                                                                          |

Training maths (overload steps, volume trends, macro splits) and work heuristics (what counts as "slipping") live in pure, unit-tested modules — the model narrates numbers it is handed, it does not invent them.

---

## Stack

| Layer          | Choice                                                         | Why                                                                                                    |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Framework      | Next.js 16 (App Router), TypeScript strict                     | Deploys natively to Vercel; RSC keeps agent definitions server-side                                    |
| Streaming      | Vercel AI SDK 7                                                | Token streaming + tool-call UI state, with a provider interface worth wrapping                         |
| Inference      | Groq (primary) → Gemini (fallback)                             | Groq owns the time-to-first-token budget; Gemini is a different vendor, so an outage is not correlated |
| Embeddings     | `gemini-embedding-001`, projected to 768 dims                  | One less provider; same width as the local fallback, so no migration when you add the key              |
| Data + vectors | Supabase Postgres + pgvector                                   | Structured rows and embeddings in one database, no separate vector store to keep in sync               |
| Type           | Inter Tight · Inter · JetBrains Mono, via `next/font`          | Self-hosted at build time — no render-blocking third-party request, no layout shift                    |
| Rate limiting  | Upstash Redis                                                  | Free tier, and the provider budgets are the thing worth protecting                                     |
| Auth           | `jose` JWT session + email allowlist                           | ~120 lines, zero beta dependencies, works unchanged on the edge runtime                                |
| Tests          | Vitest (108 unit) + Playwright (15 specs × desktop and mobile) |                                                                                                        |
| CI             | GitHub Actions                                                 | Format, lint, types, unit, then a full e2e run against a production build                              |

**On auth:** the original plan called for NextAuth. For a single-user app whose entire requirement is "one allowlisted email plus a passcode", a signed cookie via `jose` — the library NextAuth itself uses — is smaller, has no beta surface, needs no OAuth provider to be useful, and is directly testable. The trade is real: no social login and no multi-user path without replacing it. For v1 that was the right side of the trade.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000 — works with zero configuration
```

With no `.env` the app runs in open demo mode: enter any email, get a scoped guest session, and talk to seeded fitness and work data. Copy `.env.example` to `.env.local` and fill in whichever backends you want to make real.

```bash
npm run verify       # format check, lint, typecheck, unit tests
npm run test:e2e     # Playwright against a production build
```

`GET /api/health` reports which backends are live and which are running on a fallback.

### Deploying

1. Import the repository into Vercel.
2. Set `CANNON_AUTH_SECRET` (`openssl rand -base64 32`) — always.
3. Set `CANNON_AUTH_PASSCODE` and `CANNON_ALLOWED_EMAILS` to close the open demo and make it single-user.
4. Add provider and Supabase keys as you get them. Apply `supabase/schema.sql` before setting the Supabase variables.

---

## Interface

Apple HIG proportions, applied rather than referenced.

**Materials and depth.** Two surface types, each with a job. `.card` is opaque and elevated — it sits _in_ the flow. `.material` is translucent, blurred and saturated — it sits _over_ the flow, and is used only where something genuinely overlaps scrolling content (the composer, the mobile tab bar, the inspector sheet), with an opaque fallback where `backdrop-filter` is unsupported. Both carry a 1px gradient top highlight: the detail that reads as a real edge catching light instead of a drawn border. Elevation is three soft shadow passes, never one hard drop, over a graphite canvas rather than pure black — black would swallow the shadows that carry the depth.

**Type does the work.** SF Pro first, so Apple hardware renders the typeface this system was drawn against; Inter — near-identical metrics, self-hosted via `next/font` — is the cross-platform stand-in so it never degrades to a browser default; JetBrains Mono is reserved strictly for values a machine produced (tool names, ids, model chains, similarity scores), which keeps monospace a signal rather than a texture. Display sizes are fluid via `clamp()` with negative optical tracking, and numerals are tabular wherever they stack into a column.

**Geometry and space.** An 8px grid, 44px minimum touch targets, pill buttons, and 12–24px radii — large and soft, consistently. The active agent gets a tinted resting surface in its own accent, the web reading of Apple's tinted interactive glass, and that accent re-lights the canvas wash on every switch.

**Motion.** 200–480ms on `transform` and `opacity` only, `cubic-bezier(.16,1,.3,1)` for entrances. Nothing loops in the background. Everything collapses under `prefers-reduced-motion`.

**Data is drawn, not dumped.** A rising ten-tick RPE ramp rather than a progress bar — RPE is a reported ten-point scale, and the segmentation says so. A volume sparkline whose end marker is positioned in CSS so it stays a circle under the non-uniform scaling that lets the path stretch to any width. Slipping work marked with a left rule rather than a shouting alert box.

Verified at 375px, 768px, 1024px, 1440px and 2200px. The rail collapses to a floating tab bar under 768px; the Prompt Inspector docks as a third column at ≥1280px and becomes a sheet below that. An e2e test asserts zero horizontal overflow at every one of those widths, because ultrawide is where most portfolio projects quietly break.

---

## Testing

```
108 unit tests   tools and training maths, RAG scoping, chunking, the fallback
                 chain's four failure modes, auth and token tampering, the rate
                 limiter's window, store filters and ranking
 15 e2e specs    run twice (desktop + mobile): the auth gate, both agents'
                 full tool loops, transcript isolation, the inspector, the
                 responsive swap, theme persistence, horizontal overflow
```

The e2e suite runs a real production build with no provider keys, so every layer except token generation is the production path.

---

## Known limits

- **Supabase free tier** pauses after a week of inactivity and caps at 500MB. Fine for one person; worth knowing before you assume the demo is broken.
- **Without Supabase**, the memory store lives for the life of a warm serverless instance. Deliberate, and stated in the UI — the header pill reads `memory` rather than `supabase`.
- **No auto-routing in v1.** Agent selection is explicit, via tabs. A classifier that guesses wrong at 11pm is worse than a tab, and there is no usage data yet to justify one.
- **Two agents.** Finance and Learning desks are a roadmap item, not a v1 deliverable — the pattern is the same, and adding a third before the first two earn their keep is how portfolios get thin.
