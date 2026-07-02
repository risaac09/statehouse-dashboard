# CLAUDE.md

## What this repo is
A public, non-partisan plain-language dashboard of state legislature activity (bills, votes, topics). A daily GitHub Action (`refresh.yml`, 13:00 UTC) pulls OpenStates data, rewrites abstracts through a faithfulness-gated Claude pipeline, and commits flat JSON the static PWA reads. Live at risaac09.github.io/statehouse-dashboard/. The full map is `docs/PRODUCT.md`.

## Session rules
- Public repo. Per rp-intranet's guardrail, no client names, pricing, or BD detail lands here, and the portfolio angle stays out of in-repo docs.
- Non-partisan is load-bearing. The summary pipeline is copy-editing behind a binary faithfulness gate, never free paraphrase; the method is documented in `docs/PRODUCT.md` and `scripts/summarize.mjs`.
- Bump `CACHE` (`statehouse-v8`) in `sw.js` when the shell changes.
- Secrets by name: `OPENSTATES_API_KEY`, `ANTHROPIC_API_KEY`. Values never land in the repo.

## Routing
- Tier: none, a public product outside the personal stack. The spine is stack-data, Tier 1, the operational source of truth, a sibling clone (`../stack-data`).
- No phase-zero kit is deployed here; install from `../rubinstein-productions-toolkit/phase-zero/install.sh` if wanted.
- Route research, citation, and lineage tasks to stack-data and its `research-bibliographer` agent.
