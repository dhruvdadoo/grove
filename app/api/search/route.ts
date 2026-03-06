import { NextRequest, NextResponse } from "next/server";
import { parseQuery, rerankPlaces, type ParsedQuery } from "@/lib/claude";
import { fetchRedditForQuery, buildRedditContext } from "@/lib/reddit";
import { fetchHawkerCentres, getRelevantHawkerCentres, hawkerToRestaurant } from "@/lib/nea";
import { fetchFoodBlogPosts, buildBlogContext } from "@/lib/foodblogs";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatLng { latitude: number; longitude: number; }

interface OpeningHourPoint { day: number; hour: number; minute: number; }
interface OpeningHourPeriod {
  open:  OpeningHourPoint;
  close?: OpeningHourPoint;
}
interface OpeningHours {
  openNow?: boolean;
  periods?: OpeningHourPeriod[];
  weekdayDescriptions?: string[];
}

interface PlaceResult {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  types?: string[];
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: OpeningHours;
  regularOpeningHours?: OpeningHours;
  nationalPhoneNumber?: string;
  primaryTypeDisplayName?: { text: string };
  editorialSummary?: { text: string };
  location?: LatLng;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SINGAPORE_BOUNDS = {
  low:  { latitude: 1.1496, longitude: 103.5938 },
  high: { latitude: 1.4784, longitude: 104.0120 },
};

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
  "places.priceLevel",
  "places.rating",
  "places.userRatingCount",
  "places.currentOpeningHours",
  "places.regularOpeningHours",
  "places.nationalPhoneNumber",
  "places.primaryTypeDisplayName",
  "places.editorialSummary",
  "places.location",
].join(",");

const CUISINE_MAP: Record<string, string> = {
  chinese_restaurant:        "Chinese",
  indian_restaurant:         "Indian",
  japanese_restaurant:       "Japanese",
  korean_restaurant:         "Korean",
  italian_restaurant:        "Italian",
  thai_restaurant:           "Thai",
  vietnamese_restaurant:     "Vietnamese",
  malay_restaurant:          "Malay",
  seafood_restaurant:        "Seafood",
  steak_house:               "Steakhouse",
  fast_food_restaurant:      "Fast Food",
  cafe:                      "Café",
  coffee_shop:               "Café",
  bakery:                    "Bakery",
  ramen_restaurant:          "Ramen",
  sushi_restaurant:          "Japanese",
  pizza_restaurant:          "Italian",
  sandwich_shop:             "Sandwich",
  american_restaurant:       "American",
  mexican_restaurant:        "Mexican",
  mediterranean_restaurant:  "Mediterranean",
  middle_eastern_restaurant: "Middle Eastern",
  western_restaurant:        "Western",
  hawker_centre:             "Hawker",
  food_court:                "Hawker",
  bar:                       "Bar & Grill",
  pub:                       "Pub",
  barbecue_restaurant:       "BBQ",
  noodle_restaurant:         "Noodles",
  vegetarian_restaurant:     "Vegetarian",
  vegan_restaurant:          "Vegan",
  halal_restaurant:          "Halal Restaurant",
  dim_sum_restaurant:        "Dim Sum",
  hot_pot_restaurant:        "Hot Pot",
  shabu_shabu_restaurant:    "Shabu Shabu",
  teppanyaki_restaurant:     "Teppanyaki",
  poke_restaurant:           "Poke",
};

const TAG_MAP: Record<string, string> = {
  halal_restaurant:      "Halal",
  vegetarian_restaurant: "Vegetarian",
  vegan_restaurant:      "Vegan",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(h: number, m: number): string {
  const period = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function getClosingTime(hours?: OpeningHours): string {
  if (!hours) return "hours unknown";

  if (hours.periods?.length) {
    const now = new Date();
    const today = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    for (const p of hours.periods) {
      if (p.open.day !== today || !p.close) continue;
      const openMin  = p.open.hour  * 60 + (p.open.minute  ?? 0);
      const closeMin = p.close.hour * 60 + (p.close.minute ?? 0);
      if (nowMin >= openMin && nowMin < closeMin)
        return formatHour(p.close.hour, p.close.minute ?? 0);
    }

    const todayPeriods = hours.periods
      .filter((p) => p.open.day === today && p.close)
      .sort((a, b) =>
        (a.close!.hour * 60 + (a.close!.minute ?? 0)) -
        (b.close!.hour * 60 + (b.close!.minute ?? 0))
      );
    if (todayPeriods.length > 0) {
      const last = todayPeriods.at(-1)!;
      return formatHour(last.close!.hour, last.close!.minute ?? 0);
    }
  }

  if (hours.weekdayDescriptions?.length) {
    const jsDay  = new Date().getDay();
    const apiIdx = jsDay === 0 ? 6 : jsDay - 1;
    const desc   = hours.weekdayDescriptions[apiIdx] ?? "";
    const m = desc.match(/[–\-]\s*(\d+):(\d+)\s*(AM|PM)/i);
    if (m) {
      let h    = parseInt(m[1]);
      const mn = parseInt(m[2]);
      if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
      if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
      return formatHour(h, mn);
    }
  }
  return "hours vary";
}

function mapPriceLevel(level?: string): 1 | 2 | 3 {
  switch (level) {
    case "PRICE_LEVEL_FREE":
    case "PRICE_LEVEL_INEXPENSIVE": return 1;
    case "PRICE_LEVEL_MODERATE":    return 2;
    case "PRICE_LEVEL_EXPENSIVE":
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 3;
    default: return 2;
  }
}

function inferCuisine(types: string[] = []): string {
  for (const t of types) {
    if (CUISINE_MAP[t]) return CUISINE_MAP[t];
  }
  return "Restaurant";
}

function inferTags(types: string[] = []): string[] {
  return [...new Set(types.filter((t) => TAG_MAP[t]).map((t) => TAG_MAP[t]))];
}

function stripSingapore(address?: string): string {
  if (!address) return "Singapore";
  return address
    .replace(/,?\s*Singapore\s*\d{0,6}/gi, "")
    .replace(/,\s*$/, "")
    .trim();
}

function buildMatchReason(place: PlaceResult, hours?: OpeningHours): string {
  const parts: string[] = [];
  if (place.rating) {
    const count = place.userRatingCount
      ? ` (${place.userRatingCount.toLocaleString()} reviews)` : "";
    parts.push(`Rated ${place.rating}★${count}`);
  }
  if (hours?.openNow === true)  parts.push(`open until ${getClosingTime(hours)}`);
  if (hours?.openNow === false) parts.push("currently closed");
  if (place.editorialSummary?.text)         parts.push(place.editorialSummary.text);
  else if (place.primaryTypeDisplayName?.text) parts.push(place.primaryTypeDisplayName.text);
  return parts.join(" · ") || "Matches your search in Singapore";
}

function mapPlace(place: PlaceResult, index: number) {
  const types   = place.types ?? [];
  const hours   = place.currentOpeningHours ?? place.regularOpeningHours;
  const cuisine = place.primaryTypeDisplayName?.text ?? inferCuisine(types);

  return {
    id:          place.id ?? `place-${index}`,
    name:        place.displayName?.text ?? "Unknown Place",
    location:    stripSingapore(place.formattedAddress),
    cuisine,
    priceRange:  mapPriceLevel(place.priceLevel),
    isOpen:      hours?.openNow ?? true,
    closingTime: getClosingTime(hours),
    tags:        inferTags(types),
    distance:    "Nearby",
    distanceM:   0,
    matchReason: buildMatchReason(place, hours),
    phone:       place.nationalPhoneNumber,
    rating:      place.rating,
    placeId:     place.id,
    sources:     ["google"] as Array<"google" | "reddit" | "nea" | "blog">,
  };
}

/**
 * Fuzzy name match — normalise both sides and check substring containment.
 * e.g. "Al-Jilani Restaurant" matches "Al Jilani" or "Jilani"
 */
function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const na = norm(a), nb = norm(b);
  return (
    na === nb ||
    na.includes(nb) ||
    nb.includes(na) ||
    // token-level: all tokens of shorter string appear in longer
    nb.split(" ").every((t) => t.length > 2 && na.includes(t))
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const query    = request.nextUrl.searchParams.get("q")?.trim();
  const cityHint = request.nextUrl.searchParams.get("city")?.trim(); // from browser geolocation
  if (!query) {
    return NextResponse.json(
      { error: "Query parameter `q` is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  // ── Step 1: Parse query with Claude ─────────────────────────────────────────
  let parsed: ParsedQuery;
  try {
    parsed = await parseQuery(query);
    console.log("[grove] parsed:", JSON.stringify(parsed));
  } catch {
    parsed = {
      mapsQuery: query, dietary: [], openNow: false,
      vibe: [], practical: [], discovery: [],
      interpretation: `Searching for "${query}" in Singapore`,
    };
  }

  // ── Step 2: Parallel data fetch ──────────────────────────────────────────────
  // Google Maps, Reddit, NEA, and food blogs all fire concurrently.
  const [mapsResult, redditResult, hawkerCentres, blogPosts] =
    await Promise.allSettled([
      // 2a: Google Maps Places API
      fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type":    "application/json",
          "X-Goog-Api-Key":  apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery:           parsed.mapsQuery,
          locationRestriction: { rectangle: SINGAPORE_BOUNDS },
          languageCode:        "en",
          maxResultCount:      12,
        }),
        next: { revalidate: 300 },
      }),
      // 2b: Reddit community signals (prefer Claude-parsed location; fall back to browser city hint)
      fetchRedditForQuery(parsed.location ?? cityHint, parsed.mapsQuery, query),
      // 2c: NEA hawker centre data
      fetchHawkerCentres(),
      // 2d: Food blog signals
      fetchFoodBlogPosts(query, parsed.location ?? cityHint, parsed.mapsQuery),
    ]);

  // ── Step 3: Process Google Maps results ──────────────────────────────────────
  let mapsRestaurants: ReturnType<typeof mapPlace>[] = [];
  if (mapsResult.status === "fulfilled" && mapsResult.value.ok) {
    const data = await mapsResult.value.json();
    mapsRestaurants = (data.places ?? []).map(mapPlace);
  } else {
    console.error("[grove] Maps API failed:", mapsResult.status === "rejected" ? mapsResult.reason : "HTTP error");
  }

  // ── Step 4: Build community context strings for Claude ───────────────────────
  const redditCtx = redditResult.status === "fulfilled"
    ? buildRedditContext(redditResult.value) : "";
  const blogCtx   = blogPosts.status === "fulfilled"
    ? buildBlogContext(blogPosts.value) : "";

  // ── Step 5: Re-rank & filter via Claude (non-food filter + source signals) ───
  let ranked: Awaited<ReturnType<typeof rerankPlaces>>["ranked"] = [];
  let redditGems: Awaited<ReturnType<typeof rerankPlaces>>["redditGems"] = [];

  if (mapsRestaurants.length > 0) {
    try {
      const result = await rerankPlaces(
        query, parsed, mapsRestaurants, redditCtx, blogCtx
      );
      ranked      = result.ranked;
      redditGems  = result.redditGems;
    } catch (err) {
      console.error("[grove] rerank failed:", err);
      ranked = mapsRestaurants.map((r) => ({
        id: r.id, score: 5, matchReason: r.matchReason, sources: ["google"] as const,
      }));
    }
  }

  // ── Step 6: Merge ranked scores back into restaurant objects ─────────────────
  const scoreMap   = new Map(ranked.map((r) => [r.id, r]));
  const rankedIds  = new Set(ranked.map((r) => r.id));

  const finalMaps = ranked
    .map((r) => {
      const rest = mapsRestaurants.find((p) => p.id === r.id);
      if (!rest) return null;
      return {
        ...rest,
        matchReason: r.matchReason,
        sources:     r.sources,
        // Carry Reddit/blog mention count from sources
        redditMentions: r.sources.includes("reddit") ? 1 : undefined,
        blogSources:   r.sources.includes("blog")
          ? (blogPosts.status === "fulfilled"
              ? [...new Set(blogPosts.value.map((b) => b.source))].slice(0, 2)
              : undefined)
          : undefined,
      };
    })
    .filter(Boolean);

  // Append any Maps places that Claude filtered out (score < 1 = non-food) — excluded entirely
  // Remaining Maps places with score = 0 are simply not included

  // ── Step 7: Reddit gems — places from Reddit NOT found on Maps ───────────────
  const redditGemCards = redditGems
    .filter((gem) => {
      // Only surface if no similar name exists in Maps results
      return !mapsRestaurants.some((r) => namesMatch(r.name, gem.name));
    })
    .map((gem, i) => ({
      id:           `reddit-gem-${i}`,
      name:         gem.name,
      location:     parsed.location ?? "Singapore",
      cuisine:      "Local favourite",
      priceRange:   1 as const,
      isOpen:       true,
      closingTime:  "varies",
      tags:         ["Reddit Gem"],
      distance:     "Nearby",
      distanceM:    0,
      matchReason:  gem.reason,
      sources:      ["reddit"] as Array<"google" | "reddit" | "nea" | "blog">,
      isRedditGem:  true,
      sourceUrl:    redditResult.status === "fulfilled"
        ? redditResult.value.posts[0]?.url : undefined,
    }));

  // ── Step 8: NEA hawker centre supplementary cards ────────────────────────────
  const relevantHawkers = hawkerCentres.status === "fulfilled"
    ? getRelevantHawkerCentres(hawkerCentres.value, query, parsed.location)
    : [];

  const hawkerCards = relevantHawkers
    .filter((hc) => !mapsRestaurants.some((r) => namesMatch(r.name, hc.name)))
    .map((hc, i) => hawkerToRestaurant(hc, i));

  // ── Step 9: Assemble final list ───────────────────────────────────────────────
  // Order: ranked Maps results → Reddit gems → NEA hawker centres
  const restaurants = [
    ...finalMaps,
    ...redditGemCards,
    ...hawkerCards,
  ];

  // If everything failed, fall back to empty (caller handles mock fallback)
  return NextResponse.json({
    restaurants,
    query,
    parsed,
    count: restaurants.length,
    meta: {
      sources: {
        google: mapsRestaurants.length,
        reddit: redditResult.status === "fulfilled" ? redditResult.value.posts.length : 0,
        nea:    relevantHawkers.length,
        blogs:  blogPosts.status === "fulfilled" ? blogPosts.value.length : 0,
      },
      subreddits: redditResult.status === "fulfilled"
        ? redditResult.value.subreddits : [],
    },
  });
}
