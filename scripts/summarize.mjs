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
const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM = [
  'You copy-edit official Rhode Island legislative bill abstracts into plain language for a public civic dashboard. Accuracy outranks fluency: a reader must never be misled. This is copy-editing, not paraphrasing.',
  'Rules:',
  '1. Output ONE grammatical, plain declarative sentence a non-lawyer can read (a second sentence only if one is genuinely unreadable).',
  '2. Repair grammar, run-ons, and dropped words using ONLY the words and meaning already present in the abstract.',
  '3. NEVER add a noun, actor, scope, mechanism, condition, location, or example that is not explicitly in the abstract. Do not introduce words like "zoning", "towns and cities", or "first responders" unless the abstract itself uses them.',
  '4. NEVER swap a term for a near-synonym that shifts meaning (do not change "registrants" to "residents", "may" to "must", "program" to "law").',
  '5. If the abstract is garbled or ambiguous, make the SMALLEST repair that keeps its original wording and leaves the ambiguity intact, even if the result stays slightly awkward. Do not resolve ambiguity by guessing the intent.',
  '6. No preamble, no quotation marks, no "This act" or "This bill". Begin with the bill\'s own verb (Creates, Amends, Requires, Establishes, Provides, Eliminates).',
  '7. Keep proper nouns, numbers, dollar amounts, dates, and program names exactly as written.',
].join('\n');

// Rewrite one abstract. Returns a clean sentence, or null to signal fallback.
export async function plainLanguageSummary(abstract, title, key, fetchImpl) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!key || !abstract || !doFetch) return null;
  try {
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 220,
        temperature: 0,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Official title: ${title || '(none)'}\nOfficial abstract: ${abstract}\n\nPlain-language sentence:`,
        }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.content && json.content[0] && json.content[0].text || '').trim();
    // Guard against a degenerate or truncated rewrite; fall back if it looks wrong.
    if (!text || text.length < 12) return null;
    return text.replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}
