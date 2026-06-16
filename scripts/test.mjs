// test.mjs — unit tests for the data-cleaning layer. Run: node scripts/test.mjs
import assert from 'node:assert';
import {
  partyCode, plainSummary, deriveStatus, normalizeVote, normalizeBill, buildDataset,
} from './normalize.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

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

console.log(`\n${passed} tests passed.`);
