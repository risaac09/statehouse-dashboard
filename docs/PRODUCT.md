# statehouse-dashboard

A public, non-partisan plain-language dashboard of state legislature activity: recent bills, how members voted, and topic filters, live at https://risaac09.github.io/statehouse-dashboard/. A daily GitHub Action pulls OpenStates data, optionally rewrites abstracts through a faithfulness-gated Claude pipeline, and commits flat JSON that the static PWA reads. The repo sits outside the personal stack's tier registry; the spine remains stack-data, Tier 1, the operational source of truth. This is a public repo, so nothing from rp-intranet, no client names, and no pricing lands here.

## What it is (technical)

Static HTML/CSS/JS on GitHub Pages. No framework, no build step, one CSS file, all on purpose (README.md, design-prompts.md). The surfaces:

- `index.html` plus `app.js` (single IIFE, textContent-only DOM) and `app.css`.
- `sw.js`: service worker, cache-first for the app shell, network-first for `data/`. The cache name is a versioned string (`statehouse-v8` today).
- `data/<state>.json`: one flat file per state, produced in CI, read directly by the page. No live backend.
- `scripts/fetch.mjs` (API pull, pagination, one retry after a 20s sleep on HTTP 429), `scripts/normalize.mjs` (pure, unit-tested cleaning), `scripts/summarize.mjs` (optional LLM copy-edit), `scripts/test.mjs` (offline unit tests).

Dataset shape, from `scripts/normalize.mjs`: the document carries `jurisdiction`, `state`, `updated`, `source` ("OpenStates v3"), `count`, `subjects`, `subjectsDerived`, and `bills`. Each bill carries `id`, `identifier`, `title`, `summary`, `summarySource` ("plain-language" | "abstract" | "title"), `officialAbstract` (always verbatim), `subjects`, `subjectsDerived` (true when topics were keyword-inferred because OpenStates left `subject` empty), `chamber`, `status` (deriveStatus emits Enacted, Passed chamber, Failed, Vetoed, In committee, Introduced, Active), `latestActionDate`, `latestAction`, `sponsor`, `url`, `actions`, `votes`. Each vote carries `id`, `motion`, `date`, `result` (never inferred; thresholds vary), `chamber`, `counts` (yes/no/other), `byParty` per-party tallies, `members`.

## How it runs (operational)

`.github/workflows/refresh.yml` ("Refresh legislative data") does the standing work: daily cron at 13:00 UTC plus manual `workflow_dispatch` with a `states` input. It runs `node scripts/fetch.mjs`, then `node scripts/test.mjs`, then commits `data/` as statehouse-bot if anything changed. Secrets by name: `OPENSTATES_API_KEY` (required) and `ANTHROPIC_API_KEY` (optional, enables the plain-language summaries). The `STATES` repository variable or the dispatch input sets the state list; the default is `ri`. GitHub Pages deploys the branch on every push, so each data commit redeploys the live site.

Local commands (README.md): `node scripts/test.mjs`, `OPENSTATES_API_KEY=xxx node scripts/fetch.mjs ri` (the `PAGES` env tunes fetch depth, default 2), `python3 -m http.server 8000` to serve.

One rule the README omits: when a shell file changes (`index.html`, `app.css`, `app.js`, fonts, `manifest.json`), bump the `CACHE` version string in `sw.js` or returning visitors keep the stale shell.

Gap: no runbook exists for a failed refresh run; fetch.mjs retries once after a 20-second sleep on an OpenStates 429 and otherwise throws, but what a human should do when the Action fails is written nowhere. The answer would come from Isaac's practice and belongs in README.md or this doc.

## Why it exists (intellectual)

The founding why is the README's first paragraph: official trackers answer "find me bill AB-1042," and this answers "what happened this week and why should I care." The repo's most distinctive idea lives in `scripts/summarize.mjs` comments: accuracy outranks fluency, a reader must never be misled, so the LLM step is copy-editing under a binary faithfulness gate rather than free paraphrase. The README's honesty note completes the stance: summaries may simplify, check the official record.

Gap: no in-repo pointer connects this pipeline to the estate's evaluation-first stance; that lineage is stated in stack-data context docs, and a one-line cross-reference here would come from Isaac deciding whether a public repo should name the connection.

## How it works (methodological)

Two methods, both already documented at their source:

1. The faithfulness-gated summarization pipeline (`scripts/summarize.mjs`). A Sonnet call drafts a one-sentence plain-language repair of the official abstract under a no-new-facts system prompt (never add an actor, scope, or mechanism; never swap a meaning-shifting synonym; leave ambiguity intact). A second Sonnet call audits the draft against the abstract and answers exactly one token, FAITHFUL or NOT_FAITHFUL, with doubt resolved toward NOT_FAITHFUL. The rewrite ships only on a clean FAITHFUL; any other outcome, a missing key, or an API failure falls back to the deterministic `plainSummary` cleanup in normalize.mjs, and the official abstract ships verbatim in every record regardless. The summaries are copy-edits, never paraphrases, and no doc may describe them otherwise.
2. The design-iteration method (`design-prompts.md`). Six ordered Claude prompts produce self-contained mockups (kept in `design/`); the human ports styles into `app.css` and markup into `index.html`/`app.js`, keeps the one-CSS-file rule, and re-runs `node scripts/test.mjs`.

## How it speaks (marketing and comms)

Audience: regular people, not staffers or lawyers (design-prompts.md, Prompt 1). Positioning: civic infrastructure, trustworthy and neutral, public library or well-set newspaper. Microcopy is plain and a little warm, never cute or jargon-heavy. Design canon: no SaaS blue, no gradients, no gamification, light and dark via prefers-color-scheme, real accessibility, and party colors (blue D, red R, gray I) only for vote data, never as brand color. The estate voice rules in rubinsteinproductions/CLAUDE.md govern any new copy. The comms surfaces are the live page and the README itself.

The repo also serves as a portfolio demonstration piece. Who it is shown to, and any outreach detail, stays in rp-intranet per that repo's guardrail; this doc states only the neutral audience above.

## Where it goes (strategic)

Tier: none. A public app outside the personal stack; it is absent from the stack-data tier registry and is not among the ten phase-zero kit consumers listed in rubinstein-productions-toolkit/CLAUDE.md. No `.claude/` kit is deployed here and the repo has no CLAUDE.md.

Status of the README's "Possible next steps" list against the code: LLM-written summaries shipped (`scripts/summarize.mjs`, wired through fetch.mjs and refresh.yml). Member profiles, email/RSS alerts, and a federal Congress.gov mode remain unbuilt.

Gap: no in-repo record says which of the remaining next steps Isaac still intends; the README list is the only forward-looking statement and it predates the summaries shipping. The answer would come from Isaac ruling on the list.

## Workflows

Automated:
- **Refresh legislative data** (`.github/workflows/refresh.yml`). Trigger: daily cron 13:00 UTC, or manual dispatch with a `states` input. Does: `node scripts/fetch.mjs` (fetch, normalize, optional summarize, write `data/<state>.json`), `node scripts/test.mjs`, commit `data/` as statehouse-bot if changed. Secrets: `OPENSTATES_API_KEY`, `ANTHROPIC_API_KEY` (optional). Variable: `STATES`.
- **GitHub Pages deploy.** Trigger: any push to the default branch (branch-based Pages, `.nojekyll` present, no workflow file). Every daily data commit redeploys the live site.

Manual:
- **Tests**: `node scripts/test.mjs`, run after any markup or normalize change and before commit. Good looks like every assertion passing offline, no network needed.
- **Local data pull**: `OPENSTATES_API_KEY=xxx node scripts/fetch.mjs <codes>`, with `PAGES` to tune depth. Good looks like fresh `data/<state>.json` files that the local page renders.
- **Local serve**: `python3 -m http.server 8000`, then open http://localhost:8000.
- **Design iteration** (design-prompts.md): run the six Claude prompts in order, preview the self-contained mockups in `design/`, port styles into `app.css` and markup into `index.html`/`app.js`, keep the one-CSS-file rule, re-run the tests.
- **Cache bump**: when shipping shell changes, bump the `CACHE` string in `sw.js` (currently `statehouse-v8`). Good looks like returning visitors receiving the new shell on next load.

## Known drift

For Isaac to rule on; nothing here has been changed by this doc.

- README.md line 57 lists LLM-written summaries under "Possible next steps," but they shipped: scripts/summarize.mjs exists, fetch.mjs calls it, refresh.yml passes `ANTHROPIC_API_KEY`.
- README.md's pipeline diagram and "Getting live data" section omit summarize.mjs and the `ANTHROPIC_API_KEY` secret; the documented secrets list is incomplete against refresh.yml.
- README.md line 33 says the repo "ships with sample Rhode Island data"; `data/ri.json` has been live OpenStates data refreshed daily since 2026-06-22, so the sample banner app.js gates on never shows.
- design-prompts.md Prompt 5 specifies slate `#1b3a4b` and warm gold `#e9c46a`; the shipped brand uses `#0F1729`/`#9A6B2F` (index.html) and `#16323d`/`#c79324` (manifest.json). The prompts predate the brand decision.
- design-prompts.md Prompt 2 lists a status vocabulary that omits "Passed chamber" and "Active," both of which deriveStatus in normalize.mjs emits.
