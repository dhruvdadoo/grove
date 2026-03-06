import { NextRequest, NextResponse } from "next/server";
import { parseQuery, rerankPlaces, type ParsedQuery } from "@/lib/claude";
import { fetchRedditForQuery, buildRedditContext } from "@/lib/reddit";
import { fetchHawkerCentres, getRelevantHawkerCentres, hawkerToRestaurant } from "@/lib/nea";
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
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SINGAPORE_BOUNDS = {
  low:  { latitude: 1.1496, longitude: 103.5938 },
  high: { latitude: 1.4784, longitude: 104.0120 },
};

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
  "places.photos",
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
  const mapsUrl = `https://places.googleapis.com/v1/places:searchText?key=${apiKey}`;
  const headers = {
    "Content-Type":     "application/json",
    "X-Goog-FieldMask": FIELD_MASK,
  };

  if (userLat !== undefined && userLng !== undefined) {
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

// ─── Opening hours helpers ─────────────────────────────────────────────────────

function formatHour(h: number, m: number): string {
  const period = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

interface HoursInfo {
  isOpen: boolean;
  closingTime: string;
  opensNextAt?: string;
  hoursDisplay: string;
  todaySessions: Array<{ open: string; close: string }>;
}

function buildHoursInfo(hours?: OpeningHours): HoursInfo {
  const openNow = hours?.openNow ?? true;

  if (!hours) {
    return { isOpen: openNow, closingTime: "hours unknown", hoursDisplay: "Hours unknown", todaySessions: [] };
  }

  if (hours.periods?.length) {
    const now    = new Date();
    const today  = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Periods that open today; may close overnight (close.day = tomorrow)
    const todayPeriods = hours.periods
      .filter((p) => p.open.day === today && p.close)
      .sort((a, b) =>
        (a.open.hour * 60 + (a.open.minute ?? 0)) -
        (b.open.hour * 60 + (b.open.minute ?? 0))
      );

    // Also include yesterday's overnight periods that are still open today
    const yesterday = (today + 6) % 7;
    const overnightPeriods = hours.periods.filter(
      (p) => p.open.day === yesterday && p.close && p.close.day === today
    );

    if (todayPeriods.length === 0 && overnightPeriods.length === 0) {
      return { isOpen: false, closingTime: "closed today", hoursDisplay: "Closed today", todaySessions: [] };
    }

    // Build normalised sessions with minute-of-day values
    type Session = { open: string; close: string; openMin: number; closeMin: number };
    const sessions: Session[] = [];

    for (const p of overnightPeriods) {
      if (!p.close) continue;
      sessions.push({
        open:     formatHour(p.open.hour, p.open.minute ?? 0),
        close:    formatHour(p.close.hour, p.close.minute ?? 0),
        openMin:  -(1440 - (p.open.hour * 60 + (p.open.minute ?? 0))),
        closeMin: p.close.hour * 60 + (p.close.minute ?? 0),
      });
    }

    for (const p of todayPeriods) {
      if (!p.close) continue;
      const closeMin =
        p.close.day === today
          ? p.close.hour * 60 + (p.close.minute ?? 0)
          : 1440 + p.close.hour * 60 + (p.close.minute ?? 0); // closes tomorrow
      sessions.push({
        open:     formatHour(p.open.hour, p.open.minute ?? 0),
        close:    formatHour(p.close.hour, p.close.minute ?? 0),
        openMin:  p.open.hour * 60 + (p.open.minute ?? 0),
        closeMin,
      });
    }

    sessions.sort((a, b) => a.openMin - b.openMin);

    // Find which session we're currently in
    let currentSession: Session | null = null;
    let opensNextAt: string | undefined;

    for (const s of sessions) {
      if (nowMin >= s.openMin && nowMin < s.closeMin) {
        currentSession = s;
        break;
      }
    }

    // If not in any session, find next opening time today
    if (!currentSession) {
      for (const s of sessions) {
        if (s.openMin > nowMin) {
          opensNextAt = s.open;
          break;
        }
      }
    }

    const isActuallyOpen = currentSession !== null || (openNow && sessions.length > 0);
    const displaySessions = sessions.map((s) => ({ open: s.open, close: s.close }));

    // Build human-readable hours display
    let hoursDisplay: string;
    if (displaySessions.length === 1) {
      const s = displaySessions[0];
      if (isActuallyOpen) {
        hoursDisplay = `Open · Closes ${s.close}`;
      } else if (opensNextAt) {
        hoursDisplay = `Closed · Opens ${opensNextAt}`;
      } else {
        hoursDisplay = `${s.open}–${s.close}`;
      }
    } else if (displaySessions.length === 2) {
      const s0 = sessions[0];
      const s1 = sessions[1];
      // Label as Lunch/Dinner when timing looks like it
      const isLunchDinner = s0.openMin >= 10 * 60 && s0.openMin <= 13 * 60 && s1.openMin >= 17 * 60;
      const parts = isLunchDinner
        ? [`Lunch ${displaySessions[0].open}–${displaySessions[0].close}`, `Dinner ${displaySessions[1].open}–${displaySessions[1].close}`]
        : [`${displaySessions[0].open}–${displaySessions[0].close}`, `${displaySessions[1].open}–${displaySessions[1].close}`];
      hoursDisplay = parts.join(" · ");
      if (!isActuallyOpen && opensNextAt) {
        hoursDisplay += ` (Opens ${opensNextAt})`;
      }
    } else {
      hoursDisplay = displaySessions.map((s) => `${s.open}–${s.close}`).join(" · ");
    }

    const closingTime = currentSession
      ? currentSession.close
      : displaySessions[displaySessions.length - 1]?.close ?? "varies";

    return { isOpen: isActuallyOpen, closingTime, opensNextAt, hoursDisplay, todaySessions: displaySessions };
  }

  // Weekday descriptions fallback
  if (hours.weekdayDescriptions?.length) {
    const jsDay  = new Date().getDay();
    const apiIdx = jsDay === 0 ? 6 : jsDay - 1;
    const desc   = hours.weekdayDescriptions[apiIdx] ?? "";
    const cleaned = desc.replace(/^[^:]+:\s*/, "").trim();
    return {
      isOpen:        openNow,
      closingTime:   "see hours",
      hoursDisplay:  cleaned || "Hours vary",
      todaySessions: [],
    };
  }

  return { isOpen: openNow, closingTime: "hours vary", hoursDisplay: "Hours vary", todaySessions: [] };
}

// ─── Other helpers ────────────────────────────────────────────────────────────

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
  return address
    .replace(/,?\s*Singapore\s*\d{0,6}/gi, "")
    .replace(/,\s*$/, "")
    .trim();
}

function buildMatchReason(place: PlaceResult, hoursInfo: HoursInfo): string {
  const parts: string[] = [];
  if (place.rating) {
    const count = place.userRatingCount ? ` (${place.userRatingCount.toLocaleString()} reviews)` : "";
    parts.push(`Rated ${place.rating}★${count}`);
  }
  if (hoursInfo.isOpen)  parts.push(`open until ${hoursInfo.closingTime}`);
  else if (hoursInfo.opensNextAt) parts.push(`opens again at ${hoursInfo.opensNextAt}`);
  else parts.push("currently closed");
  if (place.editorialSummary?.text)            parts.push(place.editorialSummary.text);
  else if (place.primaryTypeDisplayName?.text) parts.push(place.primaryTypeDisplayName.text);
  return parts.join(" · ") || "Matches your search";
}

function mapPlace(place: PlaceResult, index: number, userLat?: number, userLng?: number) {
  const types     = place.types ?? [];
  const hours     = place.currentOpeningHours ?? place.regularOpeningHours;
  const cuisine   = place.primaryTypeDisplayName?.text ?? inferCuisine(types);
  const hoursInfo = buildHoursInfo(hours);

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
    id:            place.id ?? `place-${index}`,
    name:          place.displayName?.text ?? "Unknown Place",
    location:      stripCity(place.formattedAddress) || place.formattedAddress || "",
    fullAddress:   place.formattedAddress ?? "",
    cuisine,
    priceRange:    mapPriceLevel(place.priceLevel),
    isOpen:        hoursInfo.isOpen,
    closingTime:   hoursInfo.closingTime,
    hoursDisplay:  hoursInfo.hoursDisplay,
    opensNextAt:   hoursInfo.opensNextAt,
    todaySessions: hoursInfo.todaySessions,
    tags:          inferTags(types),
    distance,
    distanceM,
    matchReason:   buildMatchReason(place, hoursInfo),
    phone:         place.nationalPhoneNumber,
    rating:        place.rating,
    placeId:       place.id,
    sources:       ["google"] as Array<"google" | "reddit" | "nea" | "blog">,
    websiteUri:    place.websiteUri,
    reservable:    place.reservable,
    dineIn:        place.dineIn,
    userRatingCount: place.userRatingCount,
    score:         0,
    photoName:     place.photos?.[0]?.name,
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

  const startMs = Date.now();

  const userLat = latParam ? parseFloat(latParam) : undefined;
  const userLng = lngParam ? parseFloat(lngParam) : undefined;
  const hasCoords = userLat !== undefined && userLng !== undefined &&
    !isNaN(userLat) && !isNaN(userLng);

  console.log(`[grove] Search: "${query}" | city: ${cityHint ?? "none"} | GPS: ${hasCoords ? `${userLat?.toFixed(4)},${userLng?.toFixed(4)}` : "none"}`);

  // ── Time context ──────────────────────────────────────────────────────────────
  const now          = new Date();
  const currentHour  = now.getHours();
  const timeOfDay    =
    currentHour < 5  ? "late night" :
    currentHour < 10 ? "morning"    :
    currentHour < 14 ? "lunch"      :
    currentHour < 17 ? "afternoon"  :
    currentHour < 21 ? "dinner"     : "late night";
  const timeContext  = `${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })} local (${timeOfDay})`;

  // ── Cache check ───────────────────────────────────────────────────────────────
  const coordKey = hasCoords ? `${userLat!.toFixed(3)}_${userLng!.toFixed(3)}` : "nogps";
  const cacheKey = `search_v5_${query}_${coordKey}`;
  const cached   = getCached<object>(cacheKey, SEARCH_CACHE_TTL);
  if (cached) {
    console.log("[grove] Cache hit:", cacheKey);
    logSearch({
      query, city: cityHint,
      topResult: (cached as { restaurants?: Array<{ name?: string }> }).restaurants?.[0]?.name,
      resultsCount: (cached as { count?: number }).count ?? 0,
      durationMs: Date.now() - startMs,
    });
    return NextResponse.json(cached);
  }

  // ── Streaming response ────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch { /* stream may be closed */ }
      };

      try {
        // ── Step 1: Parse query (~1-2s) ──────────────────────────────────────
        let parsed: ParsedQuery;
        try {
          parsed = await parseQuery(query, timeContext);
          console.log("[grove] Parsed:", JSON.stringify(parsed));
        } catch {
          parsed = {
            mapsQuery: query, dietary: [], openNow: false,
            vibe: [], practical: [], discovery: [],
            interpretation: `Searching for "${query}"`,
          };
        }
        send({ type: "meta", parsed, query });

        // ── Step 2: Fetch Maps + Reddit + Hawker in parallel ─────────────────
        const [mapsResult, redditResult, hawkerCentres] = await Promise.allSettled([
          fetchMapsPlaces(parsed.mapsQuery, apiKey, userLat, userLng),
          fetchRedditForQuery(parsed.location ?? cityHint, parsed.mapsQuery, query, cityHint),
          fetchHawkerCentres(),
        ]);

        // ── Step 3: Process Maps results ─────────────────────────────────────
        let mapsRestaurants: ReturnType<typeof mapPlace>[] = [];
        if (mapsResult.status === "fulfilled") {
          mapsRestaurants = mapsResult.value.map((p, i) => mapPlace(p, i, userLat, userLng));
          console.log(`[grove] Maps: ${mapsRestaurants.length} results`);
        } else {
          console.error("[grove] Maps failed:", mapsResult.reason);
        }

        const redditPosts = redditResult.status === "fulfilled" ? redditResult.value : null;
        if (redditPosts) {
          console.log(`[grove] Reddit: ${redditPosts.posts.length} posts from [${redditPosts.subreddits.join(", ")}]`);
        }

        // ── Step 4: Send preliminary results (sorted by rating) ──────────────
        if (mapsRestaurants.length > 0) {
          const preliminary = [...mapsRestaurants]
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
          send({ type: "results", restaurants: preliminary, partial: true, count: preliminary.length });
          console.log(`[grove] Sent ${preliminary.length} preliminary results`);
        }

        // ── Step 5: Rerank top 5 with Claude ────────────────────────────────
        const redditCtx = redditPosts ? buildRedditContext(redditPosts) : "";
        const toRank    = mapsRestaurants.slice(0, 5).map((r) => ({
          id:            r.id,
          name:          r.name,
          cuisine:       r.cuisine,
          tags:          r.tags,
          rating:        r.rating,
          isOpen:        r.isOpen,
          matchReason:   r.matchReason,
          hoursDisplay:  r.hoursDisplay,
          todaySessions: r.todaySessions,
          opensNextAt:   r.opensNextAt,
        }));

        let ranked:     Awaited<ReturnType<typeof rerankPlaces>>["ranked"]     = [];
        let redditGems: Awaited<ReturnType<typeof rerankPlaces>>["redditGems"] = [];

        if (toRank.length > 0) {
          try {
            const result = await rerankPlaces(query, parsed, toRank, redditCtx, "", timeContext);
            ranked      = result.ranked;
            redditGems  = result.redditGems;
            console.log(`[grove] Rerank: ${ranked.length} ranked, ${redditGems.length} Reddit gems`);
          } catch (err) {
            console.error("[grove] Rerank failed:", err);
            ranked = toRank.map((r) => ({
              id: r.id, score: 5, matchReason: r.matchReason,
              sources: ["google"] as const,
            }));
          }
        }

        // ── Step 6: Build final sorted list ─────────────────────────────────
        const rankedIds = new Set(ranked.map((r) => r.id));
        const unranked  = mapsRestaurants.filter((r) => !rankedIds.has(r.id));

        const finalMaps = [
          ...ranked
            .map((r) => {
              const rest = mapsRestaurants.find((p) => p.id === r.id);
              if (!rest) return null;
              const hasReddit = r.sources.includes("reddit");
              return {
                ...rest,
                matchReason:    r.matchReason,
                matchBullets:   r.matchBullets,
                sources:        r.sources,
                score:          r.score,
                redditMentions: hasReddit ? 1 : undefined,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.rating ?? 0) - (a.rating ?? 0)),
          ...unranked
            .map((r) => ({ ...r, score: 0 }))
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
        ];

        // ── Step 7: Reddit gem cards ─────────────────────────────────────────
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
            hoursDisplay: "Hours vary",
            tags:        ["Reddit"],
            distance:    "—",
            distanceM:   9999,
            matchReason: gem.reason,
            sources:     ["reddit"] as Array<"google" | "reddit" | "nea" | "blog">,
            isRedditGem: true,
            score:       0,
            sourceUrl:   redditPosts?.posts[0]?.url,
          }));

        // ── Step 8: NEA hawker cards ─────────────────────────────────────────
        const relevantHawkers = hawkerCentres.status === "fulfilled"
          ? getRelevantHawkerCentres(hawkerCentres.value, query, parsed.location)
          : [];
        const hawkerCards = relevantHawkers
          .filter((hc) => !mapsRestaurants.some((r) => namesMatch(r.name, hc.name)))
          .map((hc, i) => hawkerToRestaurant(hc, i));

        // ── Step 9: Send final results ───────────────────────────────────────
        const restaurants = [...finalMaps, ...redditGemCards, ...hawkerCards];

        console.log(
          `[grove] Final: ${restaurants.length} total ` +
          `(${finalMaps.length} maps, ${redditGemCards.length} reddit, ${hawkerCards.length} hawker)`
        );

        send({ type: "results", restaurants, partial: false, count: restaurants.length });

        // ── Cache + analytics ────────────────────────────────────────────────
        const responseObj = {
          restaurants,
          query,
          parsed,
          count: restaurants.length,
          meta: {
            sources: {
              google: mapsRestaurants.length,
              reddit: redditPosts?.posts.length ?? 0,
              nea:    relevantHawkers.length,
            },
            subreddits: redditPosts?.subreddits ?? [],
            hasCoords,
          },
        };
        setCached(cacheKey, responseObj);
        logSearch({
          query,
          city:         cityHint,
          topResult:    restaurants[0]?.name,
          resultsCount: restaurants.length,
          durationMs:   Date.now() - startMs,
        });

        send({ type: "done" });

      } catch (err) {
        console.error("[grove] Search stream error:", err);
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":           "application/x-ndjson",
      "Cache-Control":          "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Transfer-Encoding":      "chunked",
    },
  });
}
