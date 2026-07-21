# Statehouse Dashboard

A plain-language dashboard for what your **state legislature** is actually doing: recent bills, how members voted, and the topics that affect you. Built because the official trackers answer "find me bill AB-1042," not "what happened this week and why should I care."

**Live:** https://risaac09.github.io/statehouse-dashboard/

No framework, no build step. Static HTML/CSS/JS on GitHub Pages, fed by a daily GitHub Action that pulls and cleans data from [OpenStates](https://openstates.org).

## What it shows

- **This-week activity feed:** every bill that moved recently, newest first.
- **Plain-language summaries:** the official abstract, stripped of legalese, in a sentence or two.
- **How they voted:** vote totals, pass/fail margins, and the party split for each recorded vote.
- **Topic tracking:** filter the feed by subject (health, housing, labor, and so on).
- **Search:** by bill number, title, summary, or sponsor.
- Works offline once loaded; installable as a PWA.

## The data pipeline (the interesting part)

```
OpenStates API  →  scripts/fetch.mjs  →  scripts/normalize.mjs  →  data/<state>.json  →  static page
   (gather)            (request)              (clean)                  (store)            (present)
```

- **Gather + request** (`scripts/fetch.mjs`): pulls recent bills for the configured state(s), with abstracts, actions, sponsors, and votes. Handles rate limits and pagination.
- **Clean** (`scripts/normalize.mjs`): pure, unit-tested functions that flatten the messy API shape into one consistent record per bill, derive a human status, tally party-level vote splits, and generate the plain-language summary.
- **Store**: one flat JSON file per state in `data/`, committed to the repo. The page reads these directly, so it loads instantly and needs no live backend.

Doing the fetch in CI (not the browser) keeps the API key secret, avoids CORS, and means the page is just static files.

## Getting live data

The repo ships with **sample Rhode Island data** so the dashboard works immediately. To pull real data:

1. Get a free OpenStates API key: https://open.pluralpolicy.com/accounts/profile/
2. In the repo: **Settings → Secrets and variables → Actions** → add a secret named `OPENSTATES_API_KEY`.
3. (Optional) Add a repository **variable** `STATES` with the codes you want, e.g. `ri ma ct`.
4. Run the **Refresh legislative data** workflow (Actions tab → Run workflow), or wait for the daily run.

To add your own state, just include its two-letter code. The UI picks up whatever JSON files exist.

## Run locally

```bash
# tests for the data cleaner
node scripts/test.mjs

# pull live data for one or more states
OPENSTATES_API_KEY=your_key node scripts/fetch.mjs ri

# serve the static site
python3 -m http.server 8000   # then open http://localhost:8000
```

## Possible next steps

- LLM-written summaries (richer than the heuristic) via an enrichment step in CI.
- Member profiles: voting record and attendance per legislator.
- Email/RSS alerts when a followed topic moves.
- Federal (US Congress) mode via the Congress.gov API.

## Notes

Summaries are generated from official text and may simplify or miss nuance. Always check the linked official record before acting on anything.

## Contributing

Forks welcome. Pull requests are generally not reviewed: this is a solo-maintained dashboard, and pointing it at your own state is a fork away (set the state codes in `scripts/fetch.mjs` and the workflow).

## License

MIT, see `LICENSE`.
