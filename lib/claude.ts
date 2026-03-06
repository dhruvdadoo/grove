// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedQuery {
  /** Rewritten, Google Maps-friendly query (English, concise) */
  mapsQuery: string;
  /** Neighbourhood, MRT station, or landmark extracted from query */
  location?: string;
  /** Dietary requirements: "Halal" | "Vegetarian" | "Vegan" | "No Pork" | "Gluten-Free" | "Jain" | etc. */
  dietary: string[];
  /** Maximum price per person in SGD */
  priceMax?: number;
  /** Budget tier: "budget" | "mid" | "splurge" */
  priceTier?: "budget" | "mid" | "splurge";
  /** Earliest acceptable opening hour (24h, e.g. 22 for 10pm supper) */
  afterHour?: number;
  /** Latest acceptable closing hour (24h) */
  beforeHour?: number;
  /** Must be open right now */
  openNow: boolean;
  /** Primary cuisine type or dish */
  cuisine?: string;
  /** Physical format: "hawker" | "cafe" | "kopitiam" | "restaurant" | "bar" | etc. */
  placeType?: string;
  /** Vibe / occasion */
  vibe: string[];
  /** Practical requirements */
  practical: string[];
  /** Discovery preferences */
  discovery: string[];
  /** Short human-readable sentence summarising what Grove understood */
  interpretation: string;
}

export interface RankedPlace {
  id: string;
  score: number;        // 0–10; 0 = non-food / excluded
  matchReason: string;
  sources: Array<"google" | "reddit" | "nea" | "blog">;
}

export interface RedditGem {
  name: string;
  reason: string;       // Why it was mentioned
}

// ─── Internal helper ──────────────────────────────────────────────────────────

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  maxTokens = 1024
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system:     systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

// ─── parseQuery ───────────────────────────────────────────────────────────────

const PARSE_SYSTEM = `\
You are Grove's query parser for a global food discovery app (default city: Singapore).
Your job: convert a user's natural-language food search into a strict JSON object.

CRITICAL RULE FOR mapsQuery:
The mapsQuery field is sent directly to Google Maps Places API as the TEXT SEARCH QUERY.
GPS coordinates are passed separately as locationBias — do NOT include location/city in mapsQuery.
WRONG: "Italian restaurant near Toa Payoh Singapore"
WRONG: "Halal Chinese restaurant Singapore"
RIGHT: "Italian restaurant"
RIGHT: "Halal Chinese restaurant"
RIGHT: "chicken rice hawker stall"
Keep mapsQuery to: [dietary modifier] [cuisine/dish type] [establishment type]
Strip out: location names, city names, "near me", "nearby", "in Singapore", coordinates.

Singapore context you must understand:
- MRT stations, HDB estates, neighbourhoods (Bugis, Toa Payoh, Clementi, Bedok, Jurong, etc.) → extract as location field, NOT in mapsQuery
- Singlish food terms: "zi char" (Chinese stir-fry), "hawker" (food-stall hall), "kopitiam" (kopi coffee shop), "cai png" (economy rice), "bak chor mee" (minced meat noodle), "wonton mee", "laksa", "mee pok", "char kway teow", "nasi padang", "roti prata", etc.
- Singlish phrases: "lah", "lor", "leh", "shiok", "makan" (eat), "jiak" (eat), "supper" (late-night meal), "tapao/dabao" (takeaway), "sedap" (delicious)
- Dietary needs: halal, pork-free (no pork), vegetarian, vegan, jain, gluten-free
- Price signals: "$" / "cheap" / "budget" = budget; "$$" / "mid" / "moderate" = mid; "$$$" / "splurge" / "Michelin" / "fine dining" = splurge; specific amounts like "under $10", "below $20"
- Time signals: "supper" → afterHour 22, "lunch" → afterHour 11 beforeHour 15, "breakfast" → afterHour 7 beforeHour 11, "open now" → openNow true, "24 hours" / "24h" → afterHour 0
- Vibe signals: "date night" / "romantic", "family", "solo", "group", "colleagues", "post-gym", "hangover", "celebration", "quick bite"
- Practical signals: "aircon" / "air-conditioned", "parking", "near MRT" / "MRT accessible", "cash only", "reservations", "takeaway only"
- Discovery signals: "hidden gem" / "underrated", "no queue" / "no waiting", "locals only" / "tourist-free", "new opening", "Instagram-worthy" / "IG-worthy"

Output ONLY valid JSON matching this TypeScript interface — no markdown, no explanation:
{
  "mapsQuery": string,
  "location": string | null,
  "dietary": string[],
  "priceMax": number | null,
  "priceTier": "budget"|"mid"|"splurge"|null,
  "afterHour": number | null,
  "beforeHour": number | null,
  "openNow": boolean,
  "cuisine": string | null,
  "placeType": string | null,
  "vibe": string[],
  "practical": string[],
  "discovery": string[],
  "interpretation": string
}`;

export async function parseQuery(query: string): Promise<ParsedQuery> {
  const fallback: ParsedQuery = {
    mapsQuery:      query,
    dietary:        [],
    openNow:        false,
    vibe:           [],
    practical:      [],
    discovery:      [],
    interpretation: `Searching for "${query}" in Singapore`,
  };

  try {
    const raw = await callClaude(PARSE_SYSTEM, [
      { role: "user", content: query },
    ]);

    const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const parsed  = JSON.parse(cleaned);

    return {
      mapsQuery:      parsed.mapsQuery      ?? query,
      location:       parsed.location       ?? undefined,
      dietary:        Array.isArray(parsed.dietary)  ? parsed.dietary  : [],
      priceMax:       parsed.priceMax       ?? undefined,
      priceTier:      parsed.priceTier      ?? undefined,
      afterHour:      parsed.afterHour      ?? undefined,
      beforeHour:     parsed.beforeHour     ?? undefined,
      openNow:        parsed.openNow        ?? false,
      cuisine:        parsed.cuisine        ?? undefined,
      placeType:      parsed.placeType      ?? undefined,
      vibe:           Array.isArray(parsed.vibe)      ? parsed.vibe      : [],
      practical:      Array.isArray(parsed.practical) ? parsed.practical : [],
      discovery:      Array.isArray(parsed.discovery) ? parsed.discovery : [],
      interpretation: parsed.interpretation ?? fallback.interpretation,
    };
  } catch (err) {
    console.error("parseQuery failed, using fallback:", err);
    return fallback;
  }
}

// ─── rerankPlaces ─────────────────────────────────────────────────────────────

const RERANK_SYSTEM = `\
You are Grove's result ranker for a food discovery app.
Given the user's parsed intent, a list of candidate places from Google Maps,
and optional community signals (Reddit posts, food blog titles), produce a
ranked JSON response.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY NON-FOOD FILTER — Apply BEFORE scoring anything else
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Set score = 0 for ANY place where the PRIMARY PURPOSE is NOT eating or drinking.
This includes — but is NOT limited to:
  • Gaming cafes / internet cafes / LAN shops / esports centres
  • Convenience stores (7-Eleven, FairPrice Xpress, Cheers, etc.)
  • Petrol stations / petrol kiosks
  • Supermarkets / hypermarkets / grocery stores (FairPrice, Cold Storage, Giant, NTUC, etc.)
  • Pharmacies / drugstores / clinics / medical centres
  • Banks / ATMs / money changers / insurance offices
  • Hotels / hostels / serviced apartments (UNLESS they contain a specific, named dining outlet)
  • Shopping malls as a whole (UNLESS the search targets a specific restaurant inside)
  • Retail shops / clothing / electronics / gadgets
  • Entertainment venues: cinemas, karaoke boxes, bowling alleys, arcades, escape rooms
  • Beauty salons / barbers / nail salons / spas
  • Gyms / fitness studios / yoga studios
  • Coworking spaces / offices / print shops
  • Carparks / petrol stations
  • Any place that does not serve food or drink as its core business

Grove is EXCLUSIVELY a food discovery platform. Every result must be a place where
eating or drinking is the primary purpose. When in doubt, set score = 0.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORING GUIDE (for food/drink places that pass the filter above)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9–10  Perfect match on all key parameters (dietary, cuisine, vibe, time)
7–8   Strong match, minor gaps
5–6   Decent match, some relevant signals
3–4   Weak match, only tangentially relevant
1–2   Poor match — wrong cuisine, closed when needed, fails dietary requirements
0     Non-food place (filtered out, as above)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMMUNITY SIGNAL HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If Reddit or food blog signals are provided, use them as follows:
  • A place mentioned positively in Reddit posts AND in the Maps results:
      → Add "reddit" to its sources array; give a +1 score bonus; note it in matchReason
  • A place mentioned in food blogs AND in the Maps results:
      → Add "blog" to its sources array; give a +0.5 score bonus; note it in matchReason
  • Specific high-upvote Reddit mentions are stronger signals than generic ones

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REDDIT GEM EXTRACTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From Reddit/blog signals, identify place names that are strongly recommended
but do NOT appear in the Google Maps candidates list.
Return up to 3 such "Reddit gems" in the redditGems array.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MATCH REASON FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1–2 tight sentences. Specific to WHY this place fits the query.
Mention: dietary compliance, opening hours relevance, cuisine fit, vibe, community signals.
Use Singapore food vocabulary naturally. Be enthusiastic but honest.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — Output ONLY valid JSON, no markdown:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "ranked": [
    {
      "id": "<place_id>",
      "score": <0-10>,
      "matchReason": "<string>",
      "sources": ["google"] | ["google","reddit"] | ["google","blog"] | ["google","reddit","blog"]
    }
  ],
  "redditGems": [
    { "name": "<place name>", "reason": "<why locals recommend it>" }
  ]
}`;

export interface RerankInput {
  id: string;
  name: string;
  cuisine: string;
  tags: string[];
  rating?: number;
  isOpen: boolean;
  matchReason: string;
}

export async function rerankPlaces(
  query: string,
  parsed: ParsedQuery,
  places: RerankInput[],
  redditContext: string = "",
  blogContext: string = ""
): Promise<{ ranked: RankedPlace[]; redditGems: RedditGem[] }> {
  const empty = { ranked: [], redditGems: [] };
  if (places.length === 0) return empty;

  const communitySection =
    [redditContext, blogContext].filter(Boolean).join("\n\n") ||
    "(no community signals available)";

  const userContent = JSON.stringify({
    originalQuery:   query,
    parsedIntent:    parsed,
    communitySignals: communitySection,
    candidates:      places.map((p) => ({
      id:       p.id,
      name:     p.name,
      cuisine:  p.cuisine,
      tags:     p.tags,
      rating:   p.rating,
      isOpen:   p.isOpen,
      rawMatchReason: p.matchReason,
    })),
  });

  try {
    const raw     = await callClaude(RERANK_SYSTEM, [{ role: "user", content: userContent }], 3000);
    const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    const result  = JSON.parse(cleaned);

    const ranked: RankedPlace[] = (result.ranked ?? [])
      .filter((r: RankedPlace) => r.score >= 1)   // remove non-food (score 0)
      .sort((a: RankedPlace, b: RankedPlace) => b.score - a.score);

    const redditGems: RedditGem[] = result.redditGems ?? [];

    return { ranked, redditGems };
  } catch (err) {
    console.error("rerankPlaces failed, returning original order:", err);
    return {
      ranked: places.map((p) => ({
        id:          p.id,
        score:       5,
        matchReason: p.matchReason,
        sources:     ["google"],
      })),
      redditGems: [],
    };
  }
}
