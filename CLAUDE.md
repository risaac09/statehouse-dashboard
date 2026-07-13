# CLAUDE.md

## What this repo is
A plain-language RI (and any configured state) legislative dashboard. Static HTML/CSS/JS on GitHub Pages, no framework, no build step. Read `README.md` first. The data pipeline diagram there (OpenStates API → `scripts/fetch.mjs` → `scripts/normalize.mjs` → `data/<state>.json` → static page) is the whole architecture.

## Self-running
Daily GitHub Action refreshes `data/` from OpenStates. This repo is a ring-2 keep: low-touch by design, near-zero attention needed once the `OPENSTATES_API_KEY` secret is set. A second, optional secret, `ANTHROPIC_API_KEY`, lets `scripts/summarize.mjs` rewrite bill abstracts into plain language; if it's absent, the pipeline falls back to the deterministic cleanup in `normalize.mjs`. Don't add scheduled maintenance beyond what the Action already does.

## Working here
- `scripts/normalize.mjs` is pure and unit-tested (`node scripts/test.mjs`); the data-cleaning logic lives there.
- Live at https://risaac09.github.io/statehouse-dashboard/. Changes to `index.html`/`app.js`/`app.css` deploy on push to main via Pages.
- Sample RI data ships in the repo so the dashboard works with zero setup; real data needs the OpenStates key configured as a repo secret.

## Routing
- Tier: none, a self-running public-facing app, not a stack-data consumer.
- The six phase-zero trigger phrases work here through the deployed `.claude/` kit: "activate all agents", "engage global awareness", "refresh global awareness", "delegate to your orchestrator", "engage the orchestrator", "engage your orchestrator".
