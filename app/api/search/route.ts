import { NextRequest, NextResponse } from "next/server";
import { parseQuery, rerankPlaces, type ParsedQuery } from "@/lib/claude";
import { fetchRedditForQuery, buildRedditContext } from "@/lib/reddit";
import { fetchHawkerCentres, getRelevantHawkerCentres, hawkerToRestaurant } from "@/lib/nea";
import { fetchFoodBlogPosts, buildBlogContext } from "@/lib/foodblogs";
import { getCached, setCached } from "@/lib/cache";
import { logSearch } from "@/lib/analytics";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LatLng { latitude: number; longitude: number; }
interface OpeningHourPoint { day: number; hour: number; minute: number; }
interface OpeningHourPeriod { open: OpeningHourPoint; close?: OpeningHourPoint; }
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
  websiteUri?: string;
  reservable?: boolean;
  dineIn?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SINGAPORE_BOUNDS = {
  low:  { latitude: 1.1496, longitude: 103.5938 },
  high: { latitude: 1.4784, longitude: 104.0120 },
};

// Expanding radius steps (metres) for GPS-based searches
const GPS_RADII = [1000, 2000, 5000, 10000, 20000];
const MIN_RESULTS = 5;

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
  "places.websiteUri",
  "places.reservable",
  "places.dineIn",
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

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m: number): string {
  if (m < 100)  return `${Math.round(m)}m`;
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

// ─── Maps API fetcher with expanding radius ───────────────────────────────────

async function fetchMapsPlaces(
  textQuery: string,
  apiKey: string,
  userLat?: number,
  userLng?: number
): Promise<PlaceResult[]> {
  // Key passed as query param — header-based auth (X-Goog-Api-Key) is rejected
  // when the key has HTTP-referrer restrictions, query param works universally.
  const mapsUrl = `https://places.googleapis.com/v1/places:searchText?key=${apiKey}`;
  const headers = {
    "Content-Type":     "application/json",
    "X-Goog-FieldMask": FIELD_MASK,
  };

  if (userLat !== undefined && userLng !== undefined) {
    // GPS available: try expanding radius until ≥ MIN_RESULTS
    // NOTE: locationRestriction only accepts rectangle; circles must use locationBias
    for (const radius of GPS_RADII) {
      console.log(`[grove] Maps search radius: ${radius}m, query: "${textQuery}"`);
      const res = await fetch(mapsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          textQuery,
          languageCode:   "en",
          maxResultCount: 20,
          locationBias: {
            circle: {
              center: { latitude: userLat, longitude: userLng },
              radius: radius,
            },
          },
        }),
      });
      if (!res.ok) {
        console.error(`[grove] Maps API error ${res.status} at radius ${radius}m`);
        continue;
      }
      const data   = await res.json();
      const places = (data.places ?? []) as PlaceResult[];
      console.log(`[grove] Maps returned ${places.length} results at ${radius}m radius`);
      if (places.length >= MIN_RESULTS || radius === GPS_RADII[GPS_RADII.length - 1]) {
        return places;
      }
    }
    return [];
  } else {
    // No GPS: use Singapore rectangle bounds
    const res = await fetch(mapsUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        textQuery,
        languageCode:        "en",
        maxResultCount:      20,
        locationRestriction: { rectangle: SINGAPORE_BOUNDS },
      }),
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      console.error(`[grove] Maps API error ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.places ?? []) as PlaceResult[];
  }
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
    const now    = new Date();
    const today  = now.getDay();
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
    const m      = desc.match(/[–\-]\s*(\d+):(\d+)\s*(AM|PM)/i);
    if (m) {
      let h = parseInt(m[1]);
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
  for (const t of types) if (CUISINE_MAP[t]) return CUISINE_MAP[t];
  return "Restaurant";
}

function inferTags(types: string[] = []): string[] {
  return [...new Set(types.filter((t) => TAG_MAP[t]).map((t) => TAG_MAP[t]))];
}

function stripCity(address?: string): string {
  if (!address) return "";
  // Remove trailing Singapore + postal code
  return address
    .replace(/,?\s*Singapore\s*\d{0,6}/gi, "")
    .replace(/,\s*$/, "")
    .trim();
}

function buildMatchReason(place: PlaceResult, hours?: OpeningHours): string {
  const parts: string[] = [];
  if (place.rating) {
    const count = place.userRatingCount ? ` (${place.userRatingCount.toLocaleString()} reviews)` : "";
    parts.push(`Rated ${place.rating}★${count}`);
  }
  if (hours?.openNow === true)  parts.push(`open until ${getClosingTime(hours)}`);
  if (hours?.openNow === false) parts.push("currently closed");
  if (place.editorialSummary?.text)         parts.push(place.editorialSummary.text);
  else if (place.primaryTypeDisplayName?.text) parts.push(place.primaryTypeDisplayName.text);
  return parts.join(" · ") || "Matches your search";
}

function mapPlace(place: PlaceResult, index: number, userLat?: number, userLng?: number) {
  const types   = place.types ?? [];
  const hours   = place.currentOpeningHours ?? place.regularOpeningHours;
  const cuisine = place.primaryTypeDisplayName?.text ?? inferCuisine(types);

  let distanceM = 0;
  let distance  = "—";
  if (
    userLat !== undefined && userLng !== undefined &&
    place.location?.latitude !== undefined && place.location?.longitude !== undefined
  ) {
    distanceM = Math.round(haversineM(userLat, userLng, place.location.latitude, place.location.longitude));
    distance  = formatDistance(distanceM);
  }

  return {
    id:          place.id ?? `place-${index}`,
    name:        place.displayName?.text ?? "Unknown Place",
    location:    stripCity(place.formattedAddress) || place.formattedAddress || "",
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
    websiteUri:  place.websiteUri,
    reservable:  place.reservable,
    dineIn:      place.dineIn,
    userRatingCount: place.userRatingCount,
  };
}

function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const na = norm(a), nb = norm(b);
  return (
    na === nb || na.includes(nb) || nb.includes(na) ||
    nb.split(" ").every((t) => t.length > 2 && na.includes(t))
  );
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const params   = request.nextUrl.searchParams;
  const query    = params.get("q")?.trim();
  const cityHint = params.get("city")?.trim();
  const latParam = params.get("lat");
  const lngParam = params.get("lng");

  if (!query) return NextResponse.json({ error: "Query `q` required" }, { status: 400 });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

  const startMs = Date.now(); // for analytics timing

  const userLat = latParam ? parseFloat(latParam) : undefined;
  const userLng = lngParam ? parseFloat(lngParam) : undefined;
  const hasCoords = userLat !== undefined && userLng !== undefined &&
    !isNaN(userLat) && !isNaN(userLng);

  console.log(`[grove] Search: "${query}" | city: ${cityHint ?? "none"} | GPS: ${hasCoords ? `${userLat?.toFixed(4)},${userLng?.toFixed(4)}` : "none"}`);

  // ── 10-minute search cache ────────────────────────────────────────────────
  const coordKey = hasCoords ? `${userLat!.toFixed(3)}_${userLng!.toFixed(3)}` : "nogps";
  const cacheKey = `search_v3_${query}_${coordKey}`;
  const cached   = getCached<{ restaurants?: Array<{ name?: string }>; count?: number }>(cacheKey, SEARCH_CACHE_TTL);
  if (cached) {
    console.log("[grove] Cache hit:", cacheKey);
    // Log cached hits too — duration reflects cache retrieval speed
    logSearch({
      query,
      city:         cityHint,
      topResult:    cached.restaurants?.[0]?.name,
      resultsCount: cached.count ?? cached.restaurants?.length ?? 0,
      durationMs:   Date.now() - startMs,
    });
    return NextResponse.json(cached);
  }

  // ── Step 1: Parse query with Claude ─────────────────────────────────────────
  let parsed: ParsedQuery;
  try {
    parsed = await parseQuery(query);
    console.log("[grove] Parsed:", JSON.stringify(parsed));
  } catch {
    parsed = {
      mapsQuery: query, dietary: [], openNow: false,
      vibe: [], practical: [], discovery: [],
      interpretation: `Searching for "${query}"`,
    };
  }

  // ── Step 2: Parallel data fetch ──────────────────────────────────────────────
  const [mapsResult, redditResult, hawkerCentres, blogPosts] =
    await Promise.allSettled([
      // 2a: Google Maps — expanding radius with GPS, broad text query
      fetchMapsPlaces(parsed.mapsQuery, apiKey, userLat, userLng),
      // 2b: Reddit community signals
      fetchRedditForQuery(parsed.location ?? cityHint, parsed.mapsQuery, query),
      // 2c: NEA hawker data
      fetchHawkerCentres(),
      // 2d: Food blog signals
      fetchFoodBlogPosts(query, parsed.location ?? cityHint, parsed.mapsQuery),
    ]);

  // ── Step 3: Process Maps results ──────────────────────────────────────────────
  let mapsRestaurants: ReturnType<typeof mapPlace>[] = [];
  if (mapsResult.status === "fulfilled") {
    mapsRestaurants = mapsResult.value.map((p, i) => mapPlace(p, i, userLat, userLng));
    console.log(`[grove] Maps: ${mapsRestaurants.length} results`);
  } else {
    console.error("[grove] Maps failed:", mapsResult.reason);
  }

  // ── Step 4: Blog debug logging ───────────────────────────────────────────────
  if (blogPosts.status === "fulfilled") {
    const posts = blogPosts.value;
    console.log(`[grove] Blog posts: ${posts.length} results`);
    if (posts.length > 0) {
      console.log("[grove] Blog samples:", posts.slice(0, 5).map((p) => `[${p.source}] ${p.title}`).join(" | "));
    } else {
      console.log("[grove] Blog: no posts returned — check blog scraper and cache");
    }
  } else {
    console.error("[grove] Blog fetch failed:", blogPosts.reason);
  }

  if (redditResult.status === "fulfilled") {
    console.log(`[grove] Reddit: ${redditResult.value.posts.length} posts from ${redditResult.value.subreddits.join(", ")}`);
  } else {
    console.error("[grove] Reddit failed:", redditResult.reason);
  }

  // ── Step 5: Build community context for Claude ───────────────────────────────
  const redditCtx = redditResult.status === "fulfilled" ? buildRedditContext(redditResult.value) : "";
  const blogCtx   = blogPosts.status === "fulfilled"    ? buildBlogContext(blogPosts.value)      : "";

  // ── Step 6: Rerank via Claude (top 5 for speed) ──────────────────────────────
  const toRank = mapsRestaurants.slice(0, 5);
  let ranked:     Awaited<ReturnType<typeof rerankPlaces>>["ranked"]     = [];
  let redditGems: Awaited<ReturnType<typeof rerankPlaces>>["redditGems"] = [];

  if (toRank.length > 0) {
    try {
      const result = await rerankPlaces(query, parsed, toRank, redditCtx, blogCtx);
      ranked      = result.ranked;
      redditGems  = result.redditGems;
      console.log(`[grove] Rerank: ${ranked.length} ranked, ${redditGems.length} Reddit gems`);
      // Log blog signal hits
      const blogHits = ranked.filter((r) => r.sources.includes("blog"));
      console.log(`[grove] Blog hits in rerank: ${blogHits.length} (${blogHits.map((r) => r.id).join(", ")})`);
    } catch (err) {
      console.error("[grove] Rerank failed:", err);
      ranked = toRank.map((r) => ({ id: r.id, score: 5, matchReason: r.matchReason, sources: ["google"] as const }));
    }
  }

  // ── Step 7: Merge ranked + unranked ──────────────────────────────────────────
  const rankedIds  = new Set(ranked.map((r) => r.id));
  const unranked   = mapsRestaurants.filter((r) => !rankedIds.has(r.id));

  const blogSourceNames = blogPosts.status === "fulfilled"
    ? [...new Set(blogPosts.value.map((b) => b.source))].slice(0, 2)
    : [];

  const finalMaps = [
    ...ranked
      .map((r) => {
        const rest = mapsRestaurants.find((p) => p.id === r.id);
        if (!rest) return null;
        return {
          ...rest,
          matchReason:   r.matchReason,
          sources:       r.sources,
          redditMentions: r.sources.includes("reddit") ? 1 : undefined,
          blogSources:    r.sources.includes("blog") ? blogSourceNames : undefined,
        };
      })
      .filter(Boolean),
    ...unranked, // positions 5-19 pass through unmodified
  ];

  // ── Step 8: Reddit gem cards ──────────────────────────────────────────────────
  const redditGemCards = redditGems
    .filter((gem) => !mapsRestaurants.some((r) => namesMatch(r.name, gem.name)))
    .map((gem, i) => ({
      id:          `reddit-gem-${i}`,
      name:        gem.name,
      location:    parsed.location ?? cityHint ?? "Nearby",
      cuisine:     "Local favourite",
      priceRange:  1 as const,
      isOpen:      true,
      closingTime: "varies",
      tags:        ["Reddit Gem"],
      distance:    "—",
      distanceM:   9999,
      matchReason: gem.reason,
      sources:     ["reddit"] as Array<"google" | "reddit" | "nea" | "blog">,
      isRedditGem: true,
      sourceUrl:   redditResult.status === "fulfilled" ? redditResult.value.posts[0]?.url : undefined,
    }));

  // ── Step 9: NEA hawker cards ───────────────────────────────────────────────────
  const relevantHawkers = hawkerCentres.status === "fulfilled"
    ? getRelevantHawkerCentres(hawkerCentres.value, query, parsed.location)
    : [];
  const hawkerCards = relevantHawkers
    .filter((hc) => !mapsRestaurants.some((r) => namesMatch(r.name, hc.name)))
    .map((hc, i) => hawkerToRestaurant(hc, i));

  // ── Step 10: Assemble ─────────────────────────────────────────────────────────
  const restaurants = [...finalMaps, ...redditGemCards, ...hawkerCards];

  console.log(`[grove] Final results: ${restaurants.length} (${finalMaps.length} maps, ${redditGemCards.length} reddit gems, ${hawkerCards.length} hawker)`);

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
      subreddits: redditResult.status === "fulfilled" ? redditResult.value.subreddits : [],
      hasCoords,
    },
  };

  setCached(cacheKey, response);

  // ── Fire-and-forget analytics — never awaited, never blocks response ─────────
  logSearch({
    query,
    city:         cityHint,
    topResult:    restaurants[0]?.name,
    resultsCount: restaurants.length,
    durationMs:   Date.now() - startMs,
  });

  return NextResponse.json(response);
}
