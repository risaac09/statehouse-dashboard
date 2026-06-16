# Design prompts for the Statehouse Dashboard

Prompts to feed Claude (artifact/design mode) to develop the visual design. Each
produces a self-contained `index.html` mockup you can preview in one file and
port back into `app.css` / `index.html`. No build step, no framework, on purpose.

Use them in order: run **Prompt 1** first to set direction, then the component
prompts to go deep. Paste the relevant source file alongside each prompt so
Claude designs against the real markup, not an invented one.

---

## Prompt 1 — Master design direction

> You are designing the visual identity for **Statehouse Dashboard**, a free,
> non-partisan web app that shows what a US state legislature is actually doing:
> recent bills, plain-language summaries, how members voted, and topic filters.
> The audience is regular people, not staffers or lawyers. The whole point is
> that it reads at a glance.
>
> Produce a single self-contained `index.html` (inline `<style>`, no external
> files, no JS frameworks, no CDN links) that mocks up the main dashboard view
> with 4–6 sample bill cards, a topic filter row, a search field, and a summary
> strip. Use realistic placeholder content (bill numbers like "AB 1042", real-
> sounding titles, party vote splits).
>
> Hard constraints, do not violate:
> - No SaaS blue. No gradients. No gamification, badges, or streaks.
> - No drop-shadow soup. Depth comes from borders, spacing, and one accent.
> - Must work in light and dark (use `prefers-color-scheme`).
> - Must feel trustworthy and neutral. This is civic infrastructure, not a
>   startup. Think public library or a well-set newspaper, not a dashboard SaaS.
> - Accessible: real contrast, focus states, semantic HTML, ARIA where needed.
> - Party colors are meaningful: blue for Democratic, red for Republican, gray
>   for independent/other. Use them only for vote data, never as brand color.
>
> Design language to explore: a deep slate or ink as the structural color, a
> warm parchment/paper background, and exactly one warm accent (terracotta or
> ochre) for emphasis. Generous whitespace. Strong typographic hierarchy. A
> monospace face for bill numbers and dates so they read as data.
>
> Deliver the mockup plus a short rationale: the palette (with hex values), the
> type scale, and the three decisions you made that keep it from looking generic.

---

## Prompt 2 — The bill card (the workhorse)

> Here is the current bill-card markup from the Statehouse Dashboard (paste the
> `.bill` button block from `app.js` / the rendered HTML).
>
> Redesign just this card. It appears stacked in a feed, 14px apart. Each card
> must surface, at a glance and in priority order: the bill number, a plain-
> language summary, its status (Introduced / In committee / Passed / Failed /
> Enacted / Vetoed), the chamber, the sponsor, up to three topic tags, and a
> vote result pill ("Passed 54–21") when a vote exists.
>
> Status should be readable without relying on color alone (color + label, and
> a left border accent keyed to status). Give me 6 cards covering every status
> so I can see the full range. Output a self-contained HTML file. Show the card
> in both light and dark mode side by side.

---

## Prompt 3 — Bill detail drawer + vote visualization

> Design the slide-in detail panel for a single bill in the Statehouse Dashboard
> (paste the `openDetail` / `voteCard` functions for the data shape).
>
> The panel opens from the right over a dimmed overlay and contains: the bill
> number and plain-language summary, the official title (de-emphasized), status
> and topic tags, a "How they voted" section, and a "What happened" action
> timeline.
>
> The hardest part is the vote visualization. For each recorded vote, show the
> motion, pass/fail, the overall yes/no/other split as a single horizontal bar,
> and then a per-party breakdown (D / R / I) as small split bars with counts.
> It must make the partisan story legible in under two seconds: did this pass on
> party lines or across the aisle? Do not use a charting library. Hand-roll it
> in HTML/CSS. Output a self-contained file with two sample votes, one near-
> party-line and one bipartisan, in light and dark mode.

---

## Prompt 4 — States, empties, and loading

> For the Statehouse Dashboard, design the supporting states that civic tools
> usually neglect:
> - The state picker (a dropdown of US states in the header).
> - The "sample data" banner that shows before a live API key is added.
> - Empty result ("No bills match that filter").
> - Loading skeletons for the feed while a state's JSON loads.
> - A graceful error if a state's data is missing.
>
> Keep them quiet and consistent with the main design (deep slate + parchment +
> one warm accent, no gradients, light/dark). Output one self-contained HTML
> file showing all five states. Microcopy should be plain and a little warm,
> never cute or jargon-y.

---

## Prompt 5 — The mark and the favicon

> Design a simple, flat logo mark for "Statehouse Dashboard" as inline SVG: a
> stylized statehouse dome or roofline reduced to a few strokes. It must read at
> 16px (favicon) and 192px (PWA icon). Two strokes max, one fill. Use the app's
> slate (#1b3a4b) and a warm gold (#e9c46a). Give me the SVG, a favicon data-URI
> version, and the mark sitting next to the wordmark in a header. No gradients,
> no 3D, no clip art.

---

## Prompt 6 — Mobile

> Take the Statehouse Dashboard dashboard view and design the sub-560px mobile
> layout: stacked header with full-width state picker, horizontally scrollable
> topic chips, full-bleed cards, and a detail panel that becomes a full-screen
> sheet rather than a side drawer. Touch targets at least 44px. Output a self-
> contained HTML file sized for a phone viewport, light and dark.

---

## How to use the output

Each mockup is a single HTML file. Preview it, pick what works, then port the
`<style>` rules into `app.css` and any markup changes into `index.html` /
`app.js`. Keep the one-CSS-file rule. Re-run `node scripts/test.mjs` after
markup changes to confirm the data layer still matches.
