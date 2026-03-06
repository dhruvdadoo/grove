/**
 * lib/analytics.ts — Search analytics via Airtable
 *
 * All calls are fire-and-forget:
 *  • Never awaited — never adds latency to search responses
 *  • Wrapped in try/catch — Grove works perfectly even if Airtable is down
 *  • Errors are silently ignored and never surfaced to the user
 */

export interface SearchEvent {
  query:       string;
  city?:       string;
  topResult?:  string;
  resultsCount: number;
  filtersUsed?: string[];
  durationMs:  number;
}

/**
 * Log a search event to Airtable.
 * Call without `await` — this is intentionally fire-and-forget.
 */
export function logSearch(event: SearchEvent): void {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  // No-op if credentials aren't configured
  if (!apiKey || !baseId) return;

  // Intentionally not awaited — fire and forget
  fetch(`https://api.airtable.com/v0/${baseId}/Searches`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      fields: {
        "Query":            event.query,
        "City":             event.city ?? "",
        "Timestamp":        new Date().toISOString(),
        "Top Result":       event.topResult ?? "",
        "Results Count":    event.resultsCount,
        "Filters Used":     (event.filtersUsed ?? []).join(", "),
        "Search Duration Ms": event.durationMs,
      },
    }),
  }).catch(() => {
    // Silently swallow all errors — Airtable being down must never affect Grove
  });
}
