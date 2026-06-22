// test.mjs: unit tests for the data-cleaning layer. Run: node scripts/test.mjs
import assert from 'node:assert';
import {
  partyCode, plainSummary, deriveStatus, deriveSubjects, normalizeVote, normalizeBill, buildDataset,
} from './normalize.mjs';
import { plainLanguageSummary } from './summarize.mjs';

let passed = 0;
const tests = [];
const test = (name, fn) => { tests.push([name, fn]); };

test('partyCode maps known parties and falls back', () => {
  assert.equal(partyCode('Democratic'), 'D');
  assert.equal(partyCode('republican'), 'R');
  assert.equal(partyCode('Independent'), 'I');
  assert.equal(partyCode(''), 'U');
  assert.equal(partyCode(undefined), 'U');
});

test('plainSummary strips legalese and caps length', () => {
  assert.equal(plainSummary('An act to fund rural broadband', null), 'Fund rural broadband');
  assert.equal(plainSummary(null, 'Relating to school lunches'), 'School lunches');
  const long = 'word '.repeat(100);
  assert.ok(plainSummary(long, null).length <= 241);
});

test('deriveStatus reads classification and text', () => {
  assert.equal(deriveStatus('Referred to Committee on Health', ['committee-referral']), 'In committee');
  assert.equal(deriveStatus('Chaptered by Secretary of State', ['became-law']), 'Enacted');
  assert.equal(deriveStatus('Introduced and read first time', ['introduction']), 'Introduced');
  assert.equal(deriveStatus('Failed passage in committee', ['committee-failure']), 'Failed');
});

test('normalizeVote tallies counts and party splits', () => {
  const v = normalizeVote({
    id: 'v1', motion_text: 'Do pass', start_date: '2026-06-10T00:00:00Z', result: 'pass',
    organization: { classification: 'lower' },
    counts: [{ option: 'yes', value: 2 }, { option: 'no', value: 1 }, { option: 'abstain', value: 1 }],
    votes: [
      { option: 'yes', voter_name: 'A', voter: { party: 'Democratic' } },
      { option: 'yes', voter_name: 'B', voter: { party: 'Republican' } },
      { option: 'no', voter_name: 'C', voter: { party: 'Republican' } },
      { option: 'abstain', voter_name: 'D', voter: { party: 'Democratic' } },
    ],
  });
  assert.deepEqual(v.counts, { yes: 2, no: 1, other: 1 });
  assert.equal(v.chamber, 'House');
  assert.equal(v.byParty.R.yes, 1);
  assert.equal(v.byParty.R.no, 1);
  assert.equal(v.byParty.D.other, 1);
  assert.equal(v.members.length, 4);
});

test('normalizeBill produces the clean shape', () => {
  const b = normalizeBill({
    id: 'ocd-bill/1', identifier: 'AB 100', title: 'An act relating to clean water',
    classification: ['bill'], subject: ['Environment', 'Health', 'Environment'],
    from_organization: { classification: 'lower' },
    abstracts: [{ abstract: 'Establishes a fund for lead pipe replacement in schools.' }],
    latest_action_date: '2026-06-12', latest_action_description: 'Referred to Committee on Environment',
    sponsorships: [{ name: 'Asm. Jane Doe', primary: true, party: 'Democratic' }],
    actions: [
      { date: '2026-06-01', description: 'Introduced', classification: ['introduction'] },
      { date: '2026-06-12', description: 'Referred to Committee on Environment', classification: ['committee-referral'] },
    ],
    votes: [],
    openstates_url: 'https://openstates.org/ca/bills/AB100',
  });
  assert.equal(b.identifier, 'AB 100');
  assert.equal(b.summary, 'Establishes a fund for lead pipe replacement in schools.');
  assert.deepEqual(b.subjects, ['Environment', 'Health']); // deduped + sorted
  assert.equal(b.status, 'In committee');
  assert.equal(b.sponsor, 'Asm. Jane Doe (D)');
  assert.equal(b.actions[0].date, '2026-06-12'); // newest first
});

test('buildDataset aggregates subjects and sorts bills', () => {
  const ds = buildDataset({
    jurisdiction: 'California', state: 'ca',
    rawBills: [
      { id: 'a', identifier: 'AB 1', title: 'x', subject: ['Taxation'], latest_action_date: '2026-06-01' },
      { id: 'b', identifier: 'AB 2', title: 'y', subject: ['Health'], latest_action_date: '2026-06-10' },
    ],
  });
  assert.deepEqual(ds.subjects, ['Health', 'Taxation']);
  assert.equal(ds.count, 2);
  assert.equal(ds.bills[0].identifier, 'AB 2'); // newest action first
});

test('deriveStatus covers vetoed, enacted, and the default fallthrough', () => {
  assert.equal(deriveStatus('Vetoed by the Governor', ['executive-veto']), 'Vetoed');
  assert.equal(deriveStatus('Passed Assembly', ['passage']), 'Passed chamber');
  assert.equal(deriveStatus('Some procedural note', []), 'Active'); // default branch
});

test('normalizeVote: no per-member votes leaves byParty empty and result unknown', () => {
  const v = normalizeVote({
    id: 'v0', motion_text: 'Do pass', start_date: '2026-06-01',
    organization: { classification: 'upper' },
    counts: [{ option: 'yes', value: 5 }, { option: 'no', value: 5 }], // tie, no result given
    votes: [],
  });
  assert.deepEqual(v.byParty, {});      // triggers the "not recorded" UI path
  assert.equal(v.result, 'unknown');    // no inference on a tie
  assert.equal(v.chamber, 'Senate');
});

test('normalizeBill defaults missing abstract and sponsor', () => {
  const b = normalizeBill({
    id: 'x', identifier: 'SB 9', title: 'An act to fund parks',
    classification: ['bill'], latest_action_date: '2026-06-05',
    latest_action_description: 'Introduced', // introduction text
  });
  assert.equal(b.summarySource, 'title');
  assert.equal(b.summary, 'Fund parks');
  assert.equal(b.sponsor, 'Unlisted');
  assert.equal(b.status, 'Introduced');
  assert.deepEqual(b.votes, []);
});

test('plainSummary strips a chained legalese prefix', () => {
  assert.equal(plainSummary('An act relating to water rights', null), 'Water rights');
});

test('buildDataset tolerates undefined rawBills', () => {
  const ds = buildDataset({ jurisdiction: 'Ohio', state: 'oh' });
  assert.equal(ds.count, 0);
  assert.deepEqual(ds.bills, []);
});

test('deriveSubjects infers topics from text and avoids false positives', () => {
  assert.deepEqual(deriveSubjects('AN ACT RELATING TO EDUCATION -- SCHOOL FUNDING', ''), ['Education']);
  assert.deepEqual(deriveSubjects('An act relating to hospitals', 'Expands Medicaid coverage for patients.'), ['Health']);
  assert.deepEqual(deriveSubjects('An act relating to the office of state fire marshal', ''), ['Public Safety']);
  assert.deepEqual(deriveSubjects('A purely procedural resolution', ''), []); // nothing matches -> no guess
});

test('normalizeBill derives + flags subjects when OpenStates provides none', () => {
  const b = normalizeBill({
    id: 'ocd-bill/ri1', identifier: 'SB 2181',
    title: 'AN ACT RELATING TO HEALTH AND SAFETY -- OFFICE OF STATE FIRE MARSHAL',
    classification: ['bill'], subject: [], // RI sends nothing
    latest_action_date: '2026-06-20', latest_action_description: 'Introduced',
  });
  assert.deepEqual(b.subjects, ['Health', 'Public Safety']);
  assert.equal(b.subjectsDerived, true);
});

test('normalizeBill keeps official subjects and does not flag them derived', () => {
  const b = normalizeBill({
    id: 'ocd-bill/ca9', identifier: 'AB 9', title: 'An act relating to clean water',
    classification: ['bill'], subject: ['Environment'], latest_action_date: '2026-06-05',
  });
  assert.deepEqual(b.subjects, ['Environment']);
  assert.equal(b.subjectsDerived, false);
});

test('normalizeBill uses the plain-language rewrite and preserves the official abstract verbatim', () => {
  const b = normalizeBill({
    id: 'ocd-bill/ri2', identifier: 'SB 2181', title: 'AN ACT RELATING TO HEALTH AND SAFETY',
    classification: ['bill'], subject: [], latest_action_date: '2026-06-20',
    abstracts: [{ abstract: 'Creates a program through which fire departments are notified of registrants of electric vehicles can register their vehicles.' }],
  }, 'Lets owners of electric and hybrid vehicles register them with their local fire department.');
  assert.equal(b.summarySource, 'plain-language');
  assert.match(b.summary, /register them with their local fire department/);
  assert.match(b.officialAbstract, /^Creates a program through which/); // verbatim source kept
});

test('normalizeBill falls back to deterministic cleanup when no rewrite is given', () => {
  const b = normalizeBill({
    id: 'x', identifier: 'SB 9', title: 'An act to fund parks',
    classification: ['bill'], latest_action_date: '2026-06-05', latest_action_description: 'Introduced',
  });
  assert.equal(b.summarySource, 'title');
  assert.equal(b.summary, 'Fund parks');
  assert.equal(b.officialAbstract, '');
});

test('buildDataset threads per-bill plain-language summaries', () => {
  const ds = buildDataset({
    jurisdiction: 'Rhode Island', state: 'ri',
    rawBills: [{ id: 'a', identifier: 'SB 1', title: 'x', subject: ['Health'], latest_action_date: '2026-06-10', abstracts: [{ abstract: 'Raw run-on abstract text for the bill.' }] }],
    summaries: ['Clean readable sentence.'],
  });
  assert.equal(ds.bills[0].summary, 'Clean readable sentence.');
  assert.equal(ds.bills[0].summarySource, 'plain-language');
});

test('plainLanguageSummary falls back without a key or on an API error', async () => {
  assert.equal(await plainLanguageSummary('some abstract', 'title', null), null);
  const errFetch = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await plainLanguageSummary('some abstract', 'title', 'k', errFetch), null);
});

test('plainLanguageSummary binary gate: passes only on FAITHFUL, else falls back to null', async () => {
  let a = 0; // call 1 = draft, call 2 = verdict
  const faithful = async () => { a++; const text = a === 1 ? 'Creates a clean program.' : 'FAITHFUL'; return { ok: true, json: async () => ({ content: [{ text }] }) }; };
  assert.equal(await plainLanguageSummary('abstract', 't', 'k', faithful), 'Creates a clean program.');

  let b = 0; // gate says NOT_FAITHFUL -> never ship the draft, fall back
  const rejects = async () => { b++; const text = b === 1 ? 'A distorted draft that adds new facts.' : 'NOT_FAITHFUL'; return { ok: true, json: async () => ({ content: [{ text }] }) }; };
  assert.equal(await plainLanguageSummary('abstract', 't', 'k', rejects), null);

  let c = 0; // verify call errors -> fall back rather than ship unaudited
  const verifyFails = async () => { c++; return c === 1 ? { ok: true, json: async () => ({ content: [{ text: 'A draft sentence here.' }] }) } : { ok: false, json: async () => ({}) }; };
  assert.equal(await plainLanguageSummary('abstract', 't', 'k', verifyFails), null);
});

(async () => {
  for (const [name, fn] of tests) { await fn(); passed++; console.log(`  ok  ${name}`); }
  console.log(`\n${passed} tests passed.`);
})().catch((e) => { console.error('FAILED:', e && e.stack || e); process.exit(1); });
