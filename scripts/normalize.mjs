// normalize.mjs
// Pure functions that turn raw OpenStates v3 API objects into the clean,
// flat shape the dashboard reads. Kept dependency-free and side-effect-free
// so it can be unit-tested without hitting the network.

const PARTY_CODE = {
  democratic: 'D',
  democrat: 'D',
  republican: 'R',
  independent: 'I',
  libertarian: 'L',
  green: 'G',
  nonpartisan: 'N',
};

// Map a free-text party name to a short code. Unknown -> 'U'.
export function partyCode(name) {
  if (!name) return 'U';
  const key = String(name).trim().toLowerCase();
  return PARTY_CODE[key] || (key ? key[0].toUpperCase() : 'U');
}

// Turn an official abstract or title into a short, plain line.
// This is best-effort cleanup, not real comprehension. Flagged as such in the UI.
export function plainSummary(rawAbstract, title) {
  let text = (rawAbstract && rawAbstract.trim()) || title || '';
  text = text.replace(/\s+/g, ' ').trim();
  // Strip the legalese run-up that legislative drafting always opens with.
  // Longest prefixes first; apply twice to catch chains like "An act relating to".
  const PREFIX = /^(an act to |an act |a bill for an act |a bill |relating to |to )/i;
  text = text.replace(PREFIX, '').replace(PREFIX, '');
  if (text) text = text[0].toUpperCase() + text.slice(1);
  // Cap at a readable length, breaking on a sentence boundary when we can.
  const CAP = 240;
  if (text.length > CAP) {
    const slice = text.slice(0, CAP);
    const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '));
    text = (lastStop > 80 ? slice.slice(0, lastStop + 1) : slice.trim() + '…');
  }
  return text;
}

// Derive a human status from the most recent action's classification + text.
export function deriveStatus(latestAction, classifications) {
  const cls = (classifications || []).join(' ');
  const text = (latestAction || '').toLowerCase();
  if (/became-law|chaptered|enrolled/.test(cls) || /signed|chaptered|became law/.test(text)) return 'Enacted';
  if (/passage/.test(cls) && /pass/.test(text)) return 'Passed chamber';
  if (/failure/.test(cls) || /failed|died/.test(text)) return 'Failed';
  if (/veto/.test(cls) || /veto/.test(text)) return 'Vetoed';
  if (/committee-referral|referral-committee/.test(cls) || /referred to/.test(text)) return 'In committee';
  if (/introduction/.test(cls) || /introduced|read first time/.test(text)) return 'Introduced';
  return 'Active';
}

// OpenStates leaves bill `subject` empty for many states (Rhode Island included),
// which would leave the topic filter dark. When no official subjects exist, infer
// coarse topics from the title + summary. This is keyword matching, not real
// classification, so the dataset flags it (`subjectsDerived`) and the UI labels it.
const TOPIC_PATTERNS = [
  ['Education', /\b(school|educat|student|teacher|tuition|curriculum|pupil|universit|college|classroom|literacy)/i],
  ['Elections & Government', /\b(election|voting|ballot|campaign finance|redistrict|public records|ethics commission|appropriation)/i],
  ['Environment', /\b(environment|pollution|climate|emission|renewable|conservation|wetland|recycl|solar|carbon|wildlife|forest|coastal)/i],
  ['Health', /\b(health|hospital|medicaid|medicare|patient|mental[- ]health|nurs(e|ing)|physician|disease|opioid|substance|pharmac|dental|hospice|disabilit)/i],
  ['Housing', /\b(housing|tenant|landlord|rent\b|eviction|mortgage|homeless|zoning)/i],
  ['Labor', /\b(labor|employment|wages?\b|worker|workplace|overtime|employee|union\b|occupational)/i],
  ['Public Safety', /\b(police|fire marshal|firefighter|crime|criminal|firearm|weapon|prison|sentenc|law enforcement|domestic violence)/i],
  ['Taxation', /\b(tax(es|ation)?|revenue|levy|exemption|assessment)\b/i],
  ['Technology', /\b(technolog|broadband|internet|cyber|software|digital|telecommunication)/i],
  ['Transportation', /\b(transportation|motor vehicle|highway|transit|traffic|driver|road(s|way)?\b)/i],
];

export function deriveSubjects(title, summary) {
  const text = `${title || ''} ${summary || ''}`;
  return TOPIC_PATTERNS.filter(([, re]) => re.test(text)).map(([topic]) => topic).sort();
}

const CHAMBER_LABEL = { lower: 'House', upper: 'Senate', legislature: 'Joint' };
export function chamberLabel(classification) {
  return CHAMBER_LABEL[classification] || 'Chamber';
}

// Normalize one OpenStates vote event.
export function normalizeVote(v) {
  const counts = { yes: 0, no: 0, other: 0 };
  for (const c of v.counts || []) {
    if (c.option === 'yes') counts.yes = c.value;
    else if (c.option === 'no') counts.no = c.value;
    else counts.other += c.value;
  }
  const members = (v.votes || []).map((m) => ({
    name: m.voter_name || (m.voter && m.voter.name) || 'Unknown',
    party: partyCode(m.voter && m.voter.party),
    option: m.option === 'yes' || m.option === 'no' ? m.option : 'other',
  }));
  // Tally yes/no within each party so the UI can show the split.
  const byParty = {};
  for (const m of members) {
    byParty[m.party] = byParty[m.party] || { yes: 0, no: 0, other: 0 };
    byParty[m.party][m.option] += 1;
  }
  return {
    id: v.id,
    motion: v.motion_text || 'Vote',
    date: (v.start_date || '').slice(0, 10),
    result: v.result || 'unknown', // don't infer pass/fail; thresholds vary (2/3, majority, etc.)
    chamber: chamberLabel(v.organization && v.organization.classification),
    counts,
    byParty,
    members,
  };
}

// Normalize one OpenStates bill (list item with includes) into our shape.
// `aiSummary` is an optional plain-language rewrite of the official abstract
// (see summarize.mjs). When present it becomes the displayed summary; the
// official abstract is always kept verbatim so the source is never hidden.
export function normalizeBill(b, aiSummary) {
  const abstracts = b.abstracts || [];
  const officialAbstract = (abstracts[0] && abstracts[0].abstract) || '';
  const clean = (aiSummary && aiSummary.trim()) || '';
  const summary = clean || plainSummary(officialAbstract, b.title);
  const summarySource = clean ? 'plain-language' : (abstracts[0] ? 'abstract' : 'title');
  const sponsor = (b.sponsorships || []).find((s) => s.primary || s.classification === 'primary')
    || (b.sponsorships || [])[0];
  const official = Array.from(new Set(b.subject || [])).sort();
  const subjects = official.length ? official : deriveSubjects(b.title, summary);
  const subjectsDerived = official.length === 0 && subjects.length > 0;
  const actions = (b.actions || [])
    .map((a) => ({
      date: (a.date || '').slice(0, 10),
      description: a.description || '',
      classification: a.classification || [],
    }))
    .sort((x, y) => (x.date < y.date ? 1 : -1));
  return {
    id: b.id,
    identifier: b.identifier || '',
    title: b.title || '',
    summary,
    summarySource,
    officialAbstract,
    subjects,
    subjectsDerived,
    chamber: chamberLabel(b.from_organization && b.from_organization.classification),
    status: deriveStatus(b.latest_action_description, b.classification),
    latestActionDate: (b.latest_action_date || '').slice(0, 10),
    latestAction: b.latest_action_description || '',
    sponsor: sponsor
      ? `${sponsor.name}${sponsor.party ? ` (${partyCode(sponsor.party)})` : ''}`
      : 'Unlisted',
    url: b.openstates_url || '',
    actions,
    votes: (b.votes || []).map(normalizeVote),
  };
}

// Build the full dataset document for one state.
// `summaries` (optional) is a parallel array of plain-language rewrites, one per
// rawBill, produced by summarize.mjs. Missing entries fall back to deterministic cleanup.
export function buildDataset({ jurisdiction, state, rawBills, summaries }) {
  const bills = (rawBills || []).map((b, i) => normalizeBill(b, summaries && summaries[i]));
  const subjects = Array.from(new Set(bills.flatMap((b) => b.subjects))).sort();
  const subjectsDerived = bills.some((b) => b.subjectsDerived);
  return {
    jurisdiction,
    state,
    updated: new Date().toISOString(),
    source: 'OpenStates v3',
    count: bills.length,
    subjects,
    subjectsDerived,
    bills: bills.sort((a, b) => (a.latestActionDate < b.latestActionDate ? 1 : -1)),
  };
}
