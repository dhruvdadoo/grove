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

  console.log("Airtable keys:", !!apiKey, !!baseId);

  if (!apiKey || !baseId) {
    console.warn("[grove] Airtable not configured — skipping log");
    return;
  }

  const url  = `https://api.airtable.com/v0/${baseId}/Searches`;
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type":  "application/json",
  };
  const body = JSON.stringify({
    fields: {
      "Query":              event.query,
      "City":               event.city ?? "",
      "Timestamp":          new Date().toISOString(),
      "Top Result":         event.topResult ?? "",
      "Results Count":      event.resultsCount,
      "Filters Used":       (event.filtersUsed ?? []).join(", "),
      "Search Duration Ms": event.durationMs,
    },
  });

  console.log("[grove] Airtable → POST", url);
  console.log("[grove] Airtable headers:", JSON.stringify({
    "Authorization": `Bearer ${apiKey.slice(0, 10)}...`,
    "Content-Type":  "application/json",
  }));
  console.log("[grove] Airtable body:", body);

  // Intentionally not awaited — fire and forget
  fetch(url, { method: "POST", headers, body })
    .then(async (res) => {
      const text = await res.text();
      console.log(`[grove] Airtable response ${res.status}:`, text.slice(0, 300));
    })
    .catch((err) => {
      console.error("[grove] Airtable fetch error:", err instanceof Error ? err.message : err);
    });
}
