import { NextRequest, NextResponse } from "next/server";
import { parseQuery, rerankPlaces, type ParsedQuery } from "@/lib/claude";
import { fetchRedditForQuery, buildRedditContext } from "@/lib/reddit";
import { fetchHawkerCentres, getRelevantHawkerCentres, hawkerToRestaurant } from "@/lib/nea";
import { fetchFoodBlogPosts, buildBlogContext } from "@/lib/foodblogs";
import { getCached, setCached } from "@/lib/cache";

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

const SEARCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ─── Distance helpers ─────────────────────────────────────────────────────────

/**
 * Haversine distance in metres between two lat/lng points.
 */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a  =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m: number): string {
  if (m < 100)  return `${Math.round(m)}m`;
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

// ─── Other helpers ────────────────────────────────────────────────────────────

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
  return parts.join(" · ") || "Matches your search";
}

function mapPlace(
  place: PlaceResult,
  index: number,
  userLat?: number,
  userLng?: number
) {
  const types   = place.types ?? [];
  const hours   = place.currentOpeningHours ?? place.regularOpeningHours;
  const cuisine = place.primaryTypeDisplayName?.text ?? inferCuisine(types);

  // Compute real distance if user coordinates are available
  let distanceM = 0;
  let distance  = "Nearby";
  if (
    userLat !== undefined && userLng !== undefined &&
    place.location?.latitude !== undefined && place.location?.longitude !== undefined
  ) {
    distanceM = Math.round(haversineM(
      userLat, userLng,
      place.location.latitude, place.location.longitude
    ));
    distance = formatDistance(distanceM);
  }

  return {
    id:          place.id ?? `place-${index}`,
    name:        place.displayName?.text ?? "Unknown Place",
    location:    stripSingapore(place.formattedAddress),
    fullAddress: place.formattedAddress ?? "",
    cuisine,
    priceRange:  mapPriceLevel(place.priceLevel),
    isOpen:      hours?.openNow ?? true,
    closingTime: getClosingTime(hours),
    tags:        inferTags(types),
    distance,
    distanceM,
    matchReason: buildMatchReason(place, hours),
    phone:       place.nationalPhoneNumber,
    rating:      place.rating,
    placeId:     place.id,
    sources:     ["google"] as Array<"google" | "reddit" | "nea" | "blog">,
    lat:         place.location?.latitude,
    lng:         place.location?.longitude,
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
  const params   = request.nextUrl.searchParams;
  const query    = params.get("q")?.trim();
  const cityHint = params.get("city")?.trim();   // from browser geolocation
  const latParam = params.get("lat");
  const lngParam = params.get("lng");

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

  // Parse GPS coordinates if provided
  const userLat = latParam ? parseFloat(latParam) : undefined;
  const userLng = lngParam ? parseFloat(lngParam) : undefined;
  const hasCoords = userLat !== undefined && userLng !== undefined &&
    !isNaN(userLat) && !isNaN(userLng);

  // ── 10-minute search cache ────────────────────────────────────────────────
  const cacheKey = `search_v2_${query}_${cityHint ?? ""}_${hasCoords ? `${userLat?.toFixed(4)}_${userLng?.toFixed(4)}` : ""}`;
  const cached = getCached<object>(cacheKey, SEARCH_CACHE_TTL);
  if (cached) {
    console.log("[grove] cache hit:", cacheKey);
    return NextResponse.json(cached);
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
      interpretation: `Searching for "${query}"`,
    };
  }

  // ── Step 2: Parallel data fetch ──────────────────────────────────────────────
  // Build Maps API location restriction:
  // • With GPS → circle bias around user location (5km, to get relevant results)
  // • Without GPS → Singapore rectangle bounds
  const locationBody = hasCoords
    ? {
        locationBias: {
          circle: {
            center: { latitude: userLat, longitude: userLng },
            radius: 5000.0,
          },
        },
      }
    : {
        locationRestriction: { rectangle: SINGAPORE_BOUNDS },
      };

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
          textQuery:      parsed.mapsQuery,
          languageCode:   "en",
          maxResultCount: 12,
          ...locationBody,
        }),
        next: { revalidate: 300 },
      }),
      // 2b: Reddit community signals
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
    mapsRestaurants = (data.places ?? []).map(
      (p: PlaceResult, i: number) => mapPlace(p, i, userLat, userLng)
    );
  } else {
    console.error("[grove] Maps API failed:", mapsResult.status === "rejected" ? mapsResult.reason : "HTTP error");
  }

  // ── Step 4: Build community context strings for Claude ───────────────────────
  const redditCtx = redditResult.status === "fulfilled"
    ? buildRedditContext(redditResult.value) : "";
  const blogCtx   = blogPosts.status === "fulfilled"
    ? buildBlogContext(blogPosts.value) : "";

  // ── Step 5: Re-rank via Claude — limit to top 5 for speed ───────────────────
  const toRank = mapsRestaurants.slice(0, 5); // only top 5 → faster Claude call

  let ranked: Awaited<ReturnType<typeof rerankPlaces>>["ranked"] = [];
  let redditGems: Awaited<ReturnType<typeof rerankPlaces>>["redditGems"] = [];

  if (toRank.length > 0) {
    try {
      const result = await rerankPlaces(
        query, parsed, toRank, redditCtx, blogCtx
      );
      ranked      = result.ranked;
      redditGems  = result.redditGems;
    } catch (err) {
      console.error("[grove] rerank failed:", err);
      ranked = toRank.map((r) => ({
        id: r.id, score: 5, matchReason: r.matchReason, sources: ["google"] as const,
      }));
    }
  }

  // Also include any Maps results beyond top 5 (unranked, appended after)
  const rankedIds = new Set(ranked.map((r) => r.id));
  const unranked  = mapsRestaurants.slice(5); // indices 5-11

  // ── Step 6: Merge ranked scores back into restaurant objects ─────────────────
  const finalMaps = [
    // Ranked top-5 (Claude-ordered)
    ...ranked
      .map((r) => {
        const rest = mapsRestaurants.find((p) => p.id === r.id);
        if (!rest) return null;
        return {
          ...rest,
          matchReason: r.matchReason,
          sources:     r.sources,
          redditMentions: r.sources.includes("reddit") ? 1 : undefined,
          blogSources:   r.sources.includes("blog")
            ? (blogPosts.status === "fulfilled"
                ? [...new Set(blogPosts.value.map((b) => b.source))].slice(0, 2)
                : undefined)
            : undefined,
        };
      })
      .filter(Boolean),
    // Unranked remainder (indices 5-11), pass through as-is
    ...unranked,
  ];

  // ── Step 7: Reddit gems — places from Reddit NOT found on Maps ───────────────
  const redditGemCards = redditGems
    .filter((gem) => !mapsRestaurants.some((r) => namesMatch(r.name, gem.name)))
    .map((gem, i) => ({
      id:           `reddit-gem-${i}`,
      name:         gem.name,
      location:     parsed.location ?? cityHint ?? "Nearby",
      cuisine:      "Local favourite",
      priceRange:   1 as const,
      isOpen:       true,
      closingTime:  "varies",
      tags:         ["Reddit Gem"],
      distance:     "Nearby",
      distanceM:    9999,
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
  const restaurants = [
    ...finalMaps,
    ...redditGemCards,
    ...hawkerCards,
  ];

  const response = {
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
      hasCoords,
    },
  };

  // Cache the result for 10 minutes
  setCached(cacheKey, response);

  return NextResponse.json(response);
}
