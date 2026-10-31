# Cannon

A personal multi-agent assistant where each domain gets a dedicated specialist — its own persona, its own system prompt, its own tools and its own retrieval scope — instead of one generalist chatbot wearing hats. Four desks ship with it. The rest you type into existence.

**Case study:** [harshith-nayaka-l-portfolio.vercel.app/work/cannon](https://harshith-nayaka-l-portfolio.vercel.app/work/cannon): the problem, the architecture and the engineering decisions behind Cannon.

Built to be used daily, not demoed once. The fitness desk holds real training data, the work desk a real task board, the finance desk real spend, the learning desk a real reading queue. The portfolio artifact is a by-product of a tool that had to exist anyway.

> **Cannon is domain specialisation, not task orchestration.** Its sibling project, Maestro, splits a _single_ task across collaborating roles (Thinker / Worker / Verifier / Synthesiser). Cannon runs _independent_ experts that share infrastructure and deliberately do not share context. Different architecture, different problem.

---

## What is actually interesting here

**1. Agent isolation is enforced at the query, not by convention.**
The fitness agent cannot read work documents even by accident. Retrieval takes the agent id as an argument and the Postgres function filters on it internally — there is no post-filter a caller can forget. In the memory store the same boundary is a `WHERE` on the scan, and both paths are unit-tested with mirror-image queries.

**2. Provider fallback is a model, not a `try/catch`.**
`createFallbackModel` implements the AI SDK's provider interface and wraps Groq → Gemini. `streamText`, tool execution and the UI stream protocol are all unaware a swap happened. It covers two distinct failure modes: the call that never connects, and the call that connects then errors before emitting content. Once real content is flowing, a mid-stream failure is _surfaced_ rather than silently restarted — re-running a partially executed tool chain is worse than a visible error.

**3. Every external dependency has a working fallback.**
No provider key, no database? The app still boots, builds, passes its whole test suite and serves a fully working demo. Inference falls back to a scripted model that implements the real provider interface, embeddings fall back to a deterministic lexical embedder, storage falls back to a process-local store. This is why CI can run end-to-end tests with zero secrets — the tests exercise the production code path, not a mocked-out shortcut.

**4. The roster is open — you type a domain and get an agent for it.**
Describe something no desk covers and Cannon writes one: the model produces the persona, the system prompt, the routing vocabulary and the starter prompts; the server decides the slug, the accent and the uniqueness, because those become a URL and a primary key and "trust the model to emit a valid slug" is not validation. The new desk is real, not a skin — it gets its own row, its own accent, its own retrieval namespace, and two tools (`remember`, `recall`) that write to the database and embed into a scope only it can read. It appears in the rail, joins the routing vocabulary, and can be deleted, which takes its records, embeddings and transcript with it. With no provider key the persona comes from a deterministic generator instead: worse prose, same working agent.

**5. Dispatch is a recommendation, not a router.**
The front door takes the request in plain words, scores it against every desk's own vocabulary, and picks a model for the _shape_ of the request — widest context for a wall of pasted text, strongest reasoner for a judgement call, fastest for a short capture. Both choices are shown with their reasons and both can be overruled before anything runs. Deliberately a deterministic scorer rather than an LLM classifier: routing sits in front of every request, so a model round-trip there taxes all of them, and a wrong guess sends work to an agent whose tools cannot serve it. It is instant, free, explainable in the UI and unit-tested.

**6. The Inspector.**
A docked panel showing the tool signatures in scope, which provider actually answered, whether a fallback fired, and the exact chunks retrieval pulled with their similarity scores. The system prompt is deliberately _not_ in it — `toProfile` strips it at the server/client boundary, and an e2e test asserts it never appears in the page or the RSC payload.

**7. The model list is live, not hard-coded.**
Providers do not hold still — Groq retired Kimi K2 and Qwen3 32B and shipped Qwen3.8 27B within a few months. So the picker asks each provider's own `/models` endpoint what this key can call right now (cached for an hour), and the catalog is demoted to annotations. A model we know keeps its published speed and a one-line note on what it is for; a model the provider lists that we have never seen still appears, marked **New**; one the provider has stopped listing disappears instead of 404ing on the next turn. Preview models are labelled as such. If the configured default is ever retired upstream, the chain quietly moves to the first model the provider still lists. If a listing cannot be fetched, the built-in catalog stands in for that provider alone. `GET /api/health` reports which lists are live and which models are new.

**8. Tool results are data, not pasted JSON.**
Every tool returns a tagged, typed result that the chat surface renders as a real card: an RPE meter and a next-load recommendation for a logged set, a volume sparkline and a trend verdict for a progress query, a filterable board with a slipping banner, a category breakdown with budget usage, a reading queue that flags what has gone stale.

---

## Architecture

```
                 Next.js 16 (Vercel) — App Router · RSC
                                  │
                 ┌────────────────┴────────────────┐
                 │                                 │
          Agent registry                       UI shell
   dispatch recommends, user commits    dispatch · chat · inspector
                 │
   ┌────────┬────┴─────┬──────────┬─────────────┐
   │        │          │          │             │
 Fitness   Work     Finance   Learning     …anything you type
 own prompt, own tools, own retrieval scope    generated persona
 3 tools   4 tools   2 tools   3 tools        remember · recall
   │        │          │          │             │
   └────────┴────┬─────┴──────────┴─────────────┘
                 │
                 ▼
             Shared infra
   Groq → Gemini fallback chain (provider-level)
   Gemini embeddings → local embedder fallback
   Supabase Postgres + pgvector → memory store fallback
```

No login: this is a single-user tool run for one person, so there is no session gate to draw and no rate limiting layered on top — Groq and Gemini already enforce their own free-tier ceilings, and the fallback chain already treats a 429 from either as a normal reason to hand off to the other.

---

## The agents

| Desk         | Persona                                                                                                     | Tools                                                                | Retrieval                              | Structured data            |
| ------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- | -------------------------- |
| **Fitness**  | Direct, data-driven coach. Number first, then the recommendation. No motivational filler.                   | `log_workout`, `get_progress_summary`, `calculate_macros`            | workout log · training principles      | `workouts`, `body_metrics` |
| **Work**     | Efficient chief of staff. Prioritisation first, terse status, leads with what is at risk.                   | `create_task`, `list_tasks`, `update_task_status`, `summarize_notes` | project notes · operating notes        | `tasks`, `notes`           |
| **Finance**  | Plain and unsentimental. Leads with the number, then the observation. Not an adviser — flags and defers.    | `log_expense`, `get_spending_summary`                                | expense log · budget rules             | `expenses`                 |
| **Learning** | A sharp study partner. Asks for the takeaway, because the takeaway is the point rather than the completion. | `add_reading`, `list_reading`, `finish_reading`                      | reading list · takeaways · study rules | `reading`                  |

A created desk gets the generic pair rather than bespoke tools, and that is the honest ceiling: nobody wrote the maths for a domain that did not exist five seconds ago. What it does get is a real loop — `remember` writes a titled entry and embeds it, `recall` searches only that agent's entries, and the next question can find what the last one stored.

Every built-in desk's numbers are computed in a pure, unit-tested module before the model sees them — overload steps, volume trends and macro splits; what counts as "slipping"; category shares, daily averages and budget usage; what counts as a stale queue item. The model narrates figures it is handed. It does not invent them.

---

## Stack

| Layer          | Choice                                                         | Why                                                                                                    |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Framework      | Next.js 16 (App Router), TypeScript strict                     | Deploys natively to Vercel; RSC keeps agent definitions server-side                                    |
| Streaming      | Vercel AI SDK 7                                                | Token streaming + tool-call UI state, with a provider interface worth wrapping                         |
| Inference      | Groq (primary) → Gemini (fallback)                             | Groq owns the time-to-first-token budget; Gemini is a different vendor, so an outage is not correlated |
| Models         | Live from each provider's `/models`, catalog as annotations    | New models appear and retired ones drop out without a deploy                                           |
| Embeddings     | `gemini-embedding-001`, projected to 768 dims                  | One less provider; same width as the local fallback, so no migration when you add the key              |
| Data + vectors | Supabase Postgres + pgvector                                   | Structured rows and embeddings in one database, no separate vector store to keep in sync               |
| Type           | Poppins · JetBrains Mono, vendored woff2 via `next/font/local` | No build-time fetch from Google (that fetch once broke a production deploy), no layout shift           |
| Tests          | Vitest (176 unit) + Playwright (32 specs × desktop and mobile) |                                                                                                        |
| CI             | GitHub Actions                                                 | Format, lint, types, unit, then a full e2e run against a production build                              |

**No auth, deliberately.** This is a single-user tool run by one person for their own training log and task board — there is no second user to gate out, so a login screen would be friction with nothing behind it. Groq and Gemini already enforce their own free-tier rate limits and the fallback chain already treats their 429s as a normal handoff signal, so Cannon does not add a second limiter on top.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000 — works with zero configuration
```

With no `.env` at all, `/` opens the dispatch screen with all four desks seeded and working — no sign-in step. Copy `.env.example` to `.env.local` and fill in whichever backends you want to make real.

```bash
npm run verify       # format check, lint, typecheck, unit tests
npm run test:e2e     # Playwright against a production build
```

`GET /api/health` reports which backends are live and which are running on a fallback.

### Deploying

1. Import the repository into Vercel. No required environment variables — it deploys and works immediately.
2. Add `GROQ_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` when you want real inference instead of the simulated model.
3. Add `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` when you want durable storage instead of the in-memory store. Apply `supabase/schema.sql` first. On an existing project, run the migrations in order: `001_finance_learning.sql` adds the Finance and Learning tables, `002_custom_agents.sql` adds `agents` and `records` and drops the `agent` CHECK constraint that enumerated the desks — which cannot survive a roster you extend by typing.

There is no passcode or allowlist to configure — anyone with the URL can use the deployment.

---

## Interface

Apple HIG proportions, applied rather than referenced.

**Materials and depth.** Two surface types, each with a job. `.card` is opaque and elevated — it sits _in_ the flow. `.material` is translucent, blurred and saturated — it sits _over_ the flow, and is used only where something genuinely overlaps scrolling content (the composer, the mobile tab bar, the inspector sheet), with an opaque fallback where `backdrop-filter` is unsupported. Both carry a 1px gradient top highlight: the detail that reads as a real edge catching light instead of a drawn border. Elevation is three soft shadow passes, never one hard drop, over a graphite canvas rather than pure black — black would swallow the shadows that carry the depth.

**Type does the work.** Poppins carries the whole interface, display and prose alike — one family, with hierarchy carried by size, weight and colour instead of a second typeface competing for the job. JetBrains Mono is reserved strictly for values a machine produced (tool names, ids, model chains, similarity scores), which keeps monospace a signal rather than a texture. Both ship in the repo as woff2 files (from Fontsource, SIL OFL) and load through `next/font/local`: the Google loader fetches at build time, and when Google's CSS changed under it a README-only commit failed to deploy. The scale is tuned for a geometric sans rather than a grotesque, which runs the tracking the opposite direction to the usual advice: 16px base because Poppins' x-height is markedly smaller than Inter's at the same size, only a light negative pull at display sizes because the forms are already wide, and a _positive_ nudge at 12px where its circular bowls otherwise close up into a smudge. Numerals are tabular wherever they stack into a column.

**Mobile first.** Every screen is laid out for a phone and earns its wider forms. Touch targets are 44px, 48px for the one primary action per screen. The phone tab bar holds five slots however many agents exist — Dispatch, three desks and an "All" sheet — and the active desk always keeps a slot. While the keyboard is open the bar steps aside and the composer drops onto the keys; Send keeps focus in the field so the keyboard stays up and nothing jumps mid-tap. From `lg` the dispatch screen splits in two: the ask and its recommendation pin on the left while desks and models scroll beside them.

**Geometry and space.** An 8px grid, pill buttons, and 12–24px radii — large and soft, consistently. The active agent gets a tinted resting surface in its own accent, the web reading of Apple's tinted interactive glass, and that accent re-lights the canvas wash on every switch.

**Motion.** 200–480ms on `transform` and `opacity` only, `cubic-bezier(.16,1,.3,1)` for entrances. Nothing loops in the background. Everything collapses under `prefers-reduced-motion`.

**Data is drawn, not dumped.** A rising ten-tick RPE ramp rather than a progress bar — RPE is a reported ten-point scale, and the segmentation says so. A volume sparkline whose end marker is positioned in CSS so it stays a circle under the non-uniform scaling that lets the path stretch to any width. Slipping work marked with a left rule rather than a shouting alert box.

Verified at 320px, 375px, 390px, 768px, 1024px, 1440px and 2200px, in both themes: every text colour clears 4.5:1 against the surface it actually sits on. The rail collapses to a floating tab bar under 768px; the Inspector docks as a third column at ≥1280px and becomes a sheet below that. An e2e test asserts zero horizontal overflow at every one of those widths, because ultrawide is where most portfolio projects quietly break.

---

## Testing

```
176 unit tests  tools and domain maths for all four desks, agent generation
                and slug validation, the created-agent tool surface and its
                scoping, dispatch scoring and model recommendation, catalog
                key validation, the live model list (filtering, merging,
                fallback, retired defaults), RAG scoping, chunking, the
                fallback chain's four failure modes, store filters and ranking
32 e2e specs    run twice (desktop + mobile): every desk's full tool loop,
                creating an agent from a sentence and watching it remember
                and recall, deleting one, dispatch routing and hand-off,
                transcript isolation, the inspector, the system prompt's
                absence from the payload, the responsive swap, the five-slot
                tab bar, the bar stepping aside for the keyboard, theme
                persistence, horizontal overflow
```

The e2e suite runs a real production build with no provider keys, so every layer except token generation is the production path.

---

## Known limits

- **No login.** Anyone with the deployed URL can read and write every desk's data. Acceptable for a personal tool with an unlisted URL; not something to hand to anyone else without adding a gate back.
- **No rate limiting of its own.** Relies entirely on Groq/Gemini's own free-tier ceilings and the fallback chain's handling of their 429s. Fine for one person; would need revisiting if the URL ever became widely shared.
- **Supabase free tier** pauses after a week of inactivity and caps at 500MB. Fine for one person; worth knowing before you assume the demo is broken.
- **Without Supabase**, the memory store lives for the life of a warm serverless instance. Deliberate, and stated in the UI — the header pill reads `memory` rather than `supabase`.
- **Dispatch recommends, it does not route.** The scorer never sends a request anywhere on its own — it ranks and the user commits. That is the intended design, not a missing feature: a classifier that guesses wrong at 11pm is worse than a tab. It is also keyword scoring, so it will miss a request phrased entirely outside a desk's vocabulary; the whole field stays on screen precisely so that miss costs one click rather than a wrong answer.
- **The model recommendation reads shape, not content.** Length and a handful of judgement words decide it. It is a sensible default and an explainable one, not a quality ranking — a short question that happens to need the strongest reasoner will still be handed the fastest model until you overrule it.
- **A created agent gets generic tools, not bespoke ones.** `remember` and `recall` are a real loop, but they are not `get_spending_summary`. A domain that needs actual maths needs a coded desk; what you can create at runtime is a specialist that captures and recalls, not one that computes.
- **New models arrive without notes.** A model the provider lists but the catalog does not know is offered with its context window and a guessed set of traits for the recommender. It works; it just has not been characterised. Adding it to `catalog.ts` gives it a speed figure and a real description.
- **The live list is only as fresh as its cache.** Listings are cached for an hour per server instance, so a model retired upstream can linger that long.
- **Deleting an agent is immediate and unconfirmed.** It takes that desk's records, embeddings and transcript with it, which is correct — leaving them would mean a later agent created under the same slug inherits a stranger's memory — but there is no undo.

---

## Changelog

What has shipped, newest first.

- **Redesign: the run trail.** Every answer now carries a one-line run trail — retrieval (with the top match score), each tool call, the model that answered and any fallback, wall time — expandable to the steps. The Inspector leads with the same steps for the latest turn. Dispatch became a ranked list of desks with live match bars instead of a grid of equal cards; on phones the ask bar and its verdict dock above the tab bar in thumb reach, on desktop they sit on top with desks and models in two columns. The chat header's desk badge doubles as a desk switcher on phones. Frosted glass is kept for the tab bar only; every other surface is solid. Fixed the trend sparkline, which was cut off on any chart wider than 400px.
- **Live model list.** Models come from each provider's `/models` endpoint: new ones appear marked _New_, retired ones disappear, preview ones are labelled, and a retired default falls through to a listed model. Added **Qwen3.8 27B** and **MiniMax M2.7** to the catalog; removed Kimi K2 and Qwen3 32B, which Groq retired.
- **Mobile-first pass.** Five-slot phone tab bar with an "All desks" sheet; the bar steps aside for the keyboard; 44/48px touch targets throughout; sideways-scrolling example chips; two-column dispatch on desktop; light- and dark-theme contrast fixed to clear 4.5:1 (light labels were at 2.7:1).
- **Self-hosted fonts.** Poppins and JetBrains Mono are vendored and loaded with `next/font/local`, after a change in Google's font CSS broke a production build with no code change.
- **Leak guard.** A streaming-safe transform strips `<function=…>` tool-call syntax that Groq's Llama models sometimes write into answers as text, before it reaches the client or the database.
- **Open roster.** Dispatch became the front door; Finance and Learning desks joined Fitness and Work; agents can be created by describing them, and deleted.
- **Fallback chain, Inspector, typed tool cards, isolation-by-query** — the foundations described above.
