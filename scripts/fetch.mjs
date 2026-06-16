// fetch.mjs
// Pulls recent bills (with abstracts, actions, sponsors, and votes) for one or
// more states from the OpenStates v3 API, normalizes them, and writes one clean
// JSON file per state into ../data/. Runs in GitHub Actions on a schedule.
//
// Usage:  OPENSTATES_API_KEY=xxx node scripts/fetch.mjs ca ny
// Env:    OPENSTATES_API_KEY (required), STATES (fallback if no args), PAGES (default 2)

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDataset } from './normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const API = 'https://v3.openstates.org';
const KEY = process.env.OPENSTATES_API_KEY;
const PAGES = Number(process.env.PAGES || 2); // 20 bills/page on the free tier

// state code -> OpenStates jurisdiction name
const JURISDICTION = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California',
  co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia',
  hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa',
  ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland',
  ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi', mo: 'Missouri',
  mt: 'Montana', ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire', nj: 'New Jersey',
  nm: 'New Mexico', ny: 'New York', nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio',
  ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina',
  sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah', vt: 'Vermont',
  va: 'Virginia', wa: 'Washington', wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming',
  dc: 'District of Columbia',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(jurisdiction, page) {
  const params = new URLSearchParams({
    jurisdiction,
    sort: 'latest_action_desc',
    per_page: '20',
    page: String(page),
  });
  // Includes are repeated keys.
  for (const inc of ['abstracts', 'actions', 'sponsorships', 'votes']) {
    params.append('include', inc);
  }
  const url = `${API}/bills?${params.toString()}`;
  const res = await fetch(url, { headers: { 'X-API-Key': KEY } });
  if (res.status === 429) {
    // Rate limited. Back off and retry once.
    await sleep(20000);
    return fetchPage(jurisdiction, page);
  }
  if (!res.ok) {
    throw new Error(`OpenStates ${res.status} for ${jurisdiction} p${page}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.results || [];
}

async function fetchState(code) {
  const jurisdiction = JURISDICTION[code];
  if (!jurisdiction) throw new Error(`Unknown state code: ${code}`);
  let rawBills = [];
  for (let p = 1; p <= PAGES; p++) {
    const results = await fetchPage(jurisdiction, p);
    rawBills = rawBills.concat(results);
    if (results.length < 20) break; // last page
    await sleep(6500); // stay under the free-tier per-minute limit
  }
  const dataset = buildDataset({ jurisdiction, state: code, rawBills });
  await writeFile(join(DATA_DIR, `${code}.json`), JSON.stringify(dataset, null, 2) + '\n');
  return { code, jurisdiction, count: dataset.count };
}

async function updateMeta(results) {
  const metaPath = join(DATA_DIR, 'meta.json');
  let existing = { states: [] };
  try { existing = JSON.parse(await readFile(metaPath, 'utf8')); } catch { /* first run */ }
  const byCode = new Map(existing.states.map((s) => [s.state, s]));
  for (const r of results) byCode.set(r.code, { state: r.code, jurisdiction: r.jurisdiction });
  const states = Array.from(byCode.values()).sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction));
  await writeFile(metaPath, JSON.stringify({ updated: new Date().toISOString(), states }, null, 2) + '\n');
}

async function main() {
  if (!KEY) {
    console.error('OPENSTATES_API_KEY is not set. Get a free key at https://open.pluralpolicy.com/accounts/profile/');
    process.exit(1);
  }
  const codes = (process.argv.slice(2).length ? process.argv.slice(2) : (process.env.STATES || 'ca').split(/[ ,]+/))
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const results = [];
  for (const code of codes) {
    console.log(`Fetching ${code}…`);
    results.push(await fetchState(code));
  }
  await updateMeta(results);
  console.log('Done:', results.map((r) => `${r.jurisdiction} (${r.count})`).join(', '));
}

main().catch((err) => { console.error(err); process.exit(1); });
