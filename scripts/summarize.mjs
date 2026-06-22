// summarize.mjs
// Rhode Island (and most state) bill abstracts come from OpenStates verbatim, and
// many are ungrammatical run-ons written by legislative drafters. This module
// rewrites one abstract into a single clean, plain-language sentence using the
// Anthropic API, WITHOUT adding or changing any facts. It is best-effort: if no
// API key is set or the call fails, the caller falls back to the deterministic
// `plainSummary` cleanup in normalize.mjs, so the pipeline never breaks and the
// unit tests stay offline. The official abstract is always preserved verbatim in
// the dataset and shown in the UI, so the cleaned sentence never hides the source.

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL_DRAFT = 'claude-haiku-4-5-20251001';   // the rewrite: cheap, constrained
const MODEL_VERIFY = 'claude-sonnet-4-6';           // the gate: stronger judgment for faithfulness

const SYSTEM = [
  'You copy-edit official Rhode Island legislative bill abstracts into plain language for a public civic dashboard. Accuracy outranks fluency: a reader must never be misled. This is copy-editing, not paraphrasing.',
  'Rules:',
  '1. Output ONE grammatical, plain declarative sentence a non-lawyer can read (a second sentence only if one is genuinely unreadable).',
  '2. Repair grammar, run-ons, and dropped words using ONLY the words and meaning already present in the abstract.',
  '3. NEVER add a noun, actor, scope, mechanism, condition, location, or example that is not explicitly in the abstract. Do not introduce words like "zoning", "towns and cities", or "first responders" unless the abstract itself uses them.',
  '4. NEVER swap a term for a near-synonym that shifts meaning (do not change "registrants" to "residents", "may" to "must", "program" to "law").',
  '5. When a clause dangles or a sentence runs on, prefer inserting a relative pronoun (who, that, which) or splitting into two sentences to attach it, rather than RESTRUCTURING or relabeling what a phrase refers to. Do not change "locations of registrants" into "locations where registrants".',
  '6. If the abstract is garbled or ambiguous, make the SMALLEST repair that keeps its original wording and leaves the ambiguity intact, even if the result stays slightly awkward. Do not resolve ambiguity by guessing the intent.',
  '7. No preamble, no quotation marks, no "This act" or "This bill". Begin with the bill\'s own verb (Creates, Amends, Requires, Establishes, Provides, Eliminates).',
  '8. Keep proper nouns, numbers, dollar amounts, dates, and program names exactly as written.',
].join('\n');

// The faithfulness gate. Even with a strict prompt, the generator distorts a
// fraction of summaries (fabricated scope, reversed relationships, dropped
// clauses). A second call audits each draft against its abstract and either
// confirms it or returns a corrected minimal repair, so a distortion never ships.
// A strict BINARY gate. It never returns prose we might ship by mistake: it
// answers FAITHFUL or NOT_FAITHFUL only. A rewrite passes only if it is a pure
// grammar/clarity repair; any added, dropped, reversed, or meaning-shifted fact,
// or any ambiguity resolved by guessing, fails. Anything that fails the gate
// falls back to the deterministic cleanup of the official abstract, which is
// always faithful to the source.
const VERIFY_SYSTEM = [
  'You audit a plain-language rewrite of an official Rhode Island bill abstract. A public dashboard will show the rewrite, so a reader must never be misled.',
  'The rewrite PASSES only if it changed nothing but grammar and clarity: fixing agreement, attaching a dangling clause with a relative pronoun, splitting a run-on, or removing legalese filler.',
  'It FAILS if it adds, drops, reverses, or shifts the meaning of ANY fact, scope, actor, mechanism, qualifier, or relationship, OR if it resolves a genuine ambiguity in the abstract by choosing one reading.',
  'Reply with EXACTLY one token and nothing else: FAITHFUL if it passes, or NOT_FAITHFUL if it fails. When in doubt, answer NOT_FAITHFUL.',
].join('\n');

async function callModel(model, messages, system, key, doFetch, maxTokens) {
  const res = await doFetch(ENDPOINT, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0, system, messages }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const text = (json.content && json.content[0] && json.content[0].text || '').trim();
  return text || null;
}

// Rewrite one abstract into a plain sentence, then put it through the binary gate.
// Returns the rewrite ONLY if it passes; otherwise null, so the caller falls back
// to the deterministic cleanup in normalize.mjs (always faithful to the source).
export async function plainLanguageSummary(abstract, title, key, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!key || !abstract || !doFetch) return null;
  try {
    const draft = await callModel(MODEL_DRAFT,
      [{ role: 'user', content: `Official title: ${title || '(none)'}\nOfficial abstract: ${abstract}\n\nPlain-language sentence:` }],
      SYSTEM, key, doFetch, 220);
    if (!draft || draft.length < 12) return null;
    const clean = draft.replace(/\s+/g, ' ').trim();

    const verdict = await callModel(MODEL_VERIFY,
      [{ role: 'user', content: `Official abstract: ${abstract}\n\nRewrite to audit: ${clean}\n\nVerdict (FAITHFUL or NOT_FAITHFUL):` }],
      VERIFY_SYSTEM, key, doFetch, 12);
    // Pass only on a clean FAITHFUL token; anything else falls back to the source.
    if (verdict && /^faithful\b/i.test(verdict)) return clean;
    return null;
  } catch {
    return null;
  }
}
