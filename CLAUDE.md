# CLAUDE.md

## What this repo is
A public, non-partisan plain-language RI (and any configured state) legislative dashboard. Static HTML/CSS/JS on GitHub Pages, no framework, no build step. Read `README.md` first. The data pipeline diagram there (OpenStates API → `scripts/fetch.mjs` → `scripts/normalize.mjs` → `scripts/summarize.mjs` → `data/<state>.json` → static page) is the whole architecture. The full map is `docs/PRODUCT.md`. Live at https://risaac09.github.io/statehouse-dashboard/.

## Self-running
Daily GitHub Action (`refresh.yml`, 13:00 UTC) refreshes `data/` from OpenStates and rewrites abstracts through the faithfulness-gated Claude pipeline. This repo is a ring-2 keep: low-touch by design, near-zero attention needed once the `OPENSTATES_API_KEY` secret is set. A second, optional secret, `ANTHROPIC_API_KEY`, lets `scripts/summarize.mjs` rewrite bill abstracts into plain language; if it's absent, the pipeline falls back to the deterministic cleanup in `normalize.mjs`. Don't add scheduled maintenance beyond what the Action already does.

## Session rules
- Public repo. Per rp-intranet's guardrail, no client names, pricing, or BD detail lands here, and the portfolio angle stays out of in-repo docs.
- Non-partisan is load-bearing. The summary pipeline is copy-editing behind a binary faithfulness gate, never free paraphrase; the method is documented in `docs/PRODUCT.md` and `scripts/summarize.mjs`.
- Bump `CACHE` (`statehouse-v8`) in `sw.js` when the shell changes.
- Secrets by name: `OPENSTATES_API_KEY`, `ANTHROPIC_API_KEY`. Values never land in the repo.

## Working here
- `scripts/normalize.mjs` is pure and unit-tested (`node scripts/test.mjs`); the data-cleaning logic lives there.
- Changes to `index.html`/`app.js`/`app.css` deploy on push to main via Pages.
- A committed live RI snapshot (`data/ri.json`, `data/meta.json`), refreshed daily by the Action, ships in the repo so the dashboard works with zero setup; pulling data yourself needs the OpenStates key configured as a repo secret.

## Routing
- Tier: none, a self-running public-facing app, not a stack-data consumer. The spine is stack-data, Tier 1, the operational source of truth, a sibling clone (`../stack-data`).
- The six phase-zero trigger phrases work here through the deployed `.claude/` kit: "activate all agents", "engage global awareness", "refresh global awareness", "delegate to your orchestrator", "engage the orchestrator", "engage your orchestrator".
- Route research, citation, and lineage tasks to stack-data and its `research-bibliographer` agent.
