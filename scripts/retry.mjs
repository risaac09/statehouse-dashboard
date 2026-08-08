// retry.mjs
// Bounded retry with backoff for the OpenStates calls in fetch.mjs.
//
// Retries transient failures only: 5xx responses and network errors (the
// fetch promise rejecting). Everything else, including 429, is returned to
// the caller untouched so the existing handling in fetch.mjs stays in
// charge. When the attempts run out, a 5xx response is returned as-is and a
// network error is rethrown. That preserves the pipeline's fail-loudly
// behavior: the caller throws, the workflow fails, and the last good
// committed data stays in place. No partial data is ever written.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits between attempts: attempt 1 -> 2s -> attempt 2 -> 8s -> attempt 3.
export const RETRY_DELAYS_MS = [2000, 8000];

export async function fetchWithRetry(url, options, {
  delays = RETRY_DELAYS_MS,
  fetchImpl = fetch,
  sleepImpl = sleep,
  log = console.error,
} = {}) {
  const attempts = delays.length + 1;
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res = null;
    try {
      res = await fetchImpl(url, options);
    } catch (err) {
      lastErr = err; // network error (DNS, reset, timeout): transient
    }
    if (res && res.status < 500) return res; // success, or a non-5xx the caller handles
    if (attempt === attempts) {
      if (res) return res; // final 5xx: caller's !res.ok path throws as before
      throw lastErr; // final network error: same crash as before
    }
    const why = res ? `HTTP ${res.status}` : ((lastErr && lastErr.message) || 'network error');
    const wait = delays[attempt - 1];
    log(`  transient ${why}; retrying in ${wait / 1000}s (attempt ${attempt}/${attempts})`);
    await sleepImpl(wait);
  }
  throw lastErr; // unreachable, loop always returns or throws
}
