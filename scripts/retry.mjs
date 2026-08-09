// retry.mjs
// Bounded retry with backoff for the OpenStates calls in fetch.mjs. The
// scheduled refresh failed on 2026-08-04 and 2026-08-06 when the API returned
// a single 504 Gateway Time-out; one transient gateway error should not sink a
// whole run. Retries are bounded (3 attempts, waiting 2s then 8s) and cover
// only transient failures: 5xx responses and network-level errors. Any other
// status (401, 404, 429) returns to the caller unchanged, and after the final
// attempt the last 5xx response is returned (or the last network error is
// rethrown) so the existing failure path still runs: the workflow fails
// loudly, the failure issue opens, and the dashboard keeps serving its last
// good data. Nothing here writes files, so a run that exhausts its retries
// can never leave partial data behind.

export const RETRY_DELAYS_MS = [2000, 8000]; // waits between the 3 attempts

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch with bounded retry on 5xx and network errors. `deps` lets the unit
// tests inject a fake fetch and a no-op sleep, same pattern as summarize.mjs,
// so the tests stay offline and instant.
export async function fetchWithRetry(url, options = {}, deps = {}) {
  const { fetchImpl = fetch, sleepImpl = sleep, delays = RETRY_DELAYS_MS } = deps;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchImpl(url, options);
      if (res.status >= 500 && attempt < delays.length) {
        await sleepImpl(delays[attempt]);
        continue;
      }
      return res; // success, a non-retryable status, or the final 5xx
    } catch (err) {
      if (attempt < delays.length) {
        await sleepImpl(delays[attempt]);
        continue;
      }
      throw err; // network error on the final attempt
    }
  }
}
