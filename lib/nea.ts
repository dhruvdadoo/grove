/**
 * lib/nea.ts — Singapore NEA Hawker Centre data
 *
 * Free government API from data.gov.sg — no API key required.
 * Cached for 7 days since this data changes infrequently.
 */

import { getCached, setCached } from "./cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HawkerCentre {
  name: string;
  address: string;
  stallCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_KEY = "nea_hawker_centres_v2";

const HAWKER_QUERY_RE =
  /hawker|food centre|food center|kopitiam|food court|zi char|cai png|economy rice/i;

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchHawkerCentres(): Promise<HawkerCentre[]> {
  const cached = getCached<HawkerCentre[]>(CACHE_KEY, TTL_MS);
  if (cached) return cached;

  try {
    const res = await fetch(
      "https://data.gov.sg/api/action/datastore_search?resource_id=d_68a42f09f350881996d83f9cd73ab02f&limit=500",
      { next: { revalidate: 86_400 * 7 } }
    );
    if (!res.ok) return [];

    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const centres: HawkerCentre[] = (json.result?.records ?? [])
      .map((r: any) => ({
        name: (
          r.name_of_centre     ||
          r.name               ||
          r.NAME               ||
          r.hawker_centre_name ||
          r.HAWKER_CENTRE_NAME ||
          ""
        ).trim(),
        address: (
          r.location_of_centre ||
          r.address_myenv      ||
          r.ADDRESS            ||
          r.address            ||
          ""
        ).trim(),
        stallCount: parseInt(r.no_of_stalls || r.NO_OF_STALLS || "0", 10) || 0,
      }))
      .filter((c: HawkerCentre) => c.name.length > 0);

    setCached(CACHE_KEY, centres);
    return centres;
  } catch (err) {
    console.error("[nea] fetch failed:", err);
    return [];
  }
}

// ─── Filtering ────────────────────────────────────────────────────────────────

/**
 * Return hawker centres relevant to the current search.
 * Rules:
 *   1. If query mentions "hawker", "food centre", "kopitiam", etc. → return up to 5
 *   2. If a location is provided, return centres whose name/address contains that location
 *   3. Otherwise return nothing (no noise)
 */
export function getRelevantHawkerCentres(
  centres: HawkerCentre[],
  query: string,
  location?: string
): HawkerCentre[] {
  const wantsHawker = HAWKER_QUERY_RE.test(query);
  const loc = (location ?? "").toLowerCase().trim();

  return centres
    .filter((c) => {
      if (wantsHawker) return true;
      if (!loc) return false;
      const n = c.name.toLowerCase();
      const a = c.address.toLowerCase();
      return n.includes(loc) || a.includes(loc);
    })
    .slice(0, 5);
}

/**
 * Convert a HawkerCentre to a minimal Restaurant-compatible shape
 * so it can be rendered as a ResultCard.
 */
export function hawkerToRestaurant(hc: HawkerCentre, index: number) {
  return {
    id:          `nea-${index}-${hc.name.replace(/\W+/g, "")}`,
    name:        hc.name,
    location:    hc.address || "Singapore",
    cuisine:     "Hawker Centre",
    priceRange:  1 as const,
    isOpen:      true,
    closingTime: "varies",
    tags:        ["Hawker Centre"],
    distance:    "Nearby",
    distanceM:   0,
    matchReason: `Official Singapore hawker centre with ${hc.stallCount > 0 ? `${hc.stallCount} stalls` : "multiple stalls"}. A great place to explore local food culture.`,
    sources:     ["nea"] as Array<"google" | "reddit" | "nea" | "blog">,
  };
}
