/**
 * lib/reddit.ts — Community signals from Reddit
 *
 * Uses public Reddit JSON endpoints (no API key required).
 * Each city maps to 2 subreddits: food-specific + general city sub.
 * Results are cached for 24 hours in the in-memory cache.
 */

import { getCached, setCached } from "./cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RedditPost {
  title:     string;
  text:      string;
  score:     number;
  url:       string;
  subreddit: string;
}

export interface RedditResult {
  posts:      RedditPost[];
  subreddits: string[];
  city:       string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TTL_MS    = 24 * 60 * 60 * 1000; // 24 hours
const REDDIT_UA = "Grove/1.0 Food Discovery App (contact@grove.sg)";

// city keyword → [food subreddit, city/general subreddit]
// Exact mapping as specified — never hardcode Singapore as fallback.
const CITY_MAP: Record<string, string[]> = {
  // ── Singapore ──────────────────────────────────────────────────────────────
  singapore:      ["SingaporeEats", "singapore"],
  sg:             ["SingaporeEats", "singapore"],
  bugis:          ["SingaporeEats", "singapore"],
  sentosa:        ["SingaporeEats", "singapore"],
  "orchard road": ["SingaporeEats", "singapore"],

  // ── Malaysia ───────────────────────────────────────────────────────────────
  "kuala lumpur": ["MalaysiaFood", "malaysia"],
  kl:             ["MalaysiaFood", "malaysia"],
  malaysia:       ["MalaysiaFood", "malaysia"],
  penang:         ["MalaysiaFood", "malaysia"],
  johor:          ["MalaysiaFood", "malaysia"],

  // ── Thailand ───────────────────────────────────────────────────────────────
  bangkok:        ["ThailandTourism", "bangkok"],
  thailand:       ["ThailandTourism", "bangkok"],
  "chiang mai":   ["ThailandTourism", "chiangmai"],
  phuket:         ["ThailandTourism", "phuket"],

  // ── Indonesia ──────────────────────────────────────────────────────────────
  jakarta:        ["indonesia", "jakarta"],
  indonesia:      ["indonesia", "jakarta"],
  bali:           ["indonesia", "bali"],
  surabaya:       ["indonesia", "indonesia"],

  // ── Philippines ────────────────────────────────────────────────────────────
  manila:         ["PHFood", "manila"],
  philippines:    ["PHFood", "manila"],
  cebu:           ["PHFood", "cebu"],

  // ── Hong Kong ──────────────────────────────────────────────────────────────
  "hong kong":    ["HongKong", "hongkong"],
  hk:             ["HongKong", "hongkong"],

  // ── Japan ──────────────────────────────────────────────────────────────────
  tokyo:          ["JapanTravel", "tokyo"],
  osaka:          ["JapanTravel", "osaka"],
  kyoto:          ["JapanTravel", "kyoto"],
  japan:          ["JapanTravel", "tokyo"],
  hokkaido:       ["JapanTravel", "hokkaido"],

  // ── South Korea ────────────────────────────────────────────────────────────
  seoul:          ["korea", "seoul"],
  busan:          ["korea", "busan"],
  korea:          ["korea", "seoul"],

  // ── Taiwan ─────────────────────────────────────────────────────────────────
  taipei:         ["taiwan", "taipei"],
  taiwan:         ["taiwan", "taipei"],

  // ── Vietnam ────────────────────────────────────────────────────────────────
  "ho chi minh":  ["VietNam", "saigon"],
  hcmc:           ["VietNam", "saigon"],
  saigon:         ["VietNam", "saigon"],
  hanoi:          ["VietNam", "hanoi"],
  vietnam:        ["VietNam", "saigon"],

  // ── Australia ──────────────────────────────────────────────────────────────
  sydney:         ["sydney",    "australia"],
  melbourne:      ["melbourne", "australia"],
  brisbane:       ["brisbane",  "australia"],
  australia:      ["sydney",    "australia"],

  // ── United Kingdom ─────────────────────────────────────────────────────────
  london:         ["london", "unitedkingdom"],
  uk:             ["london", "unitedkingdom"],
  england:        ["london", "unitedkingdom"],

  // ── USA — New York ─────────────────────────────────────────────────────────
  "new york":     ["FoodNYC", "nycfood"],
  nyc:            ["FoodNYC", "nycfood"],
  brooklyn:       ["FoodNYC", "nycfood"],
  manhattan:      ["FoodNYC", "nycfood"],
  queens:         ["FoodNYC", "nycfood"],
  bronx:          ["FoodNYC", "nycfood"],

  // ── USA — Los Angeles ──────────────────────────────────────────────────────
  "los angeles":  ["LosAngeles", "food"],
  la:             ["LosAngeles", "food"],

  // ── USA — San Francisco ────────────────────────────────────────────────────
  "san francisco":["BayAreaFood", "bayarea"],
  "sf":           ["BayAreaFood", "bayarea"],
  "bay area":     ["BayAreaFood", "bayarea"],

  // ── USA — Chicago ──────────────────────────────────────────────────────────
  chicago:        ["chicagofood", "chicago"],

  // ── France ─────────────────────────────────────────────────────────────────
  paris:          ["paris",  "france"],
  france:         ["paris",  "france"],

  // ── UAE ────────────────────────────────────────────────────────────────────
  dubai:          ["dubai", "UAE"],
  uae:            ["dubai", "UAE"],

  // ── India ──────────────────────────────────────────────────────────────────
  mumbai:         ["mumbai", "india"],
  delhi:          ["india",  "delhi"],
  bangalore:      ["india",  "bangalore"],
  india:          ["mumbai", "india"],
};

const FOOD_KEYWORDS =
  "recommend best where to eat hidden gem supper lunch dinner must try";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detect a city key from location/cityHint strings.
 * Returns null (not "singapore") if no match — callers must handle null.
 */
export function detectCity(
  location?: string,
  cityHint?: string
): string | null {
  const haystack = [location ?? "", cityHint ?? ""].join(" ").toLowerCase();
  // Longest-match first to avoid "la" matching "kuala lumpur"
  const keys = Object.keys(CITY_MAP).sort((a, b) => b.length - a.length);
  for (const city of keys) {
    if (haystack.includes(city)) return city;
  }
  return null;
}

async function discoverSubredditsForCity(
  city: string
): Promise<string[]> {
  const cacheKey = `reddit_subs_discovery_${city}`;
  const cached   = getCached<string[]>(cacheKey, 7 * 24 * 60 * 60 * 1000);
  if (cached) return cached;

  try {
    const [foodRes, cityRes] = await Promise.allSettled([
      fetch(
        `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(city + " food")}&limit=3`,
        { headers: { "User-Agent": REDDIT_UA } }
      ),
      fetch(
        `https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(city)}&limit=3`,
        { headers: { "User-Agent": REDDIT_UA } }
      ),
    ]);

    const foodSub =
      foodRes.status === "fulfilled" && foodRes.value.ok
        ? (((await foodRes.value.json()).data?.children?.[0]?.data
            ?.display_name) as string | undefined) ?? "food"
        : "food";

    const citySub =
      cityRes.status === "fulfilled" && cityRes.value.ok
        ? (((await cityRes.value.json()).data?.children?.[0]?.data
            ?.display_name) as string | undefined) ?? city
        : city;

    const result: string[] = [foodSub, citySub];
    setCached(cacheKey, result);
    return result;
  } catch {
    return ["food", city];
  }
}

// ─── Core fetcher ─────────────────────────────────────────────────────────────

async function fetchSubredditPosts(
  subreddit: string,
  query: string
): Promise<RedditPost[]> {
  const cacheKey = `reddit_posts_${subreddit}_${query.replace(/\W+/g, "_").slice(0, 60)}`;
  const cached   = getCached<RedditPost[]>(cacheKey, TTL_MS);
  if (cached) {
    console.log(`[grove] Reddit r/${subreddit} cache hit: ${cached.length} posts`);
    return cached;
  }

  const searchTerms = query.trim() || FOOD_KEYWORDS;
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(
    searchTerms
  )}&sort=top&limit=25&restrict_sr=true`;

  console.log(`[grove] Reddit fetching r/${subreddit}: "${searchTerms}"`);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": REDDIT_UA },
      signal:  AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Log the actual HTTP status + body for debugging blocked/rate-limited requests
      const body = await res.text().catch(() => "(unreadable)");
      console.error(
        `[grove] Reddit r/${subreddit} HTTP ${res.status} ${res.statusText}` +
        ` | body: ${body.slice(0, 300)}`
      );
      return [];
    }

    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts: RedditPost[] = (json.data?.children ?? []).map((c: any) => ({
      title:     c.data.title     ?? "",
      text:      (c.data.selftext ?? "").slice(0, 800),
      score:     c.data.score     ?? 0,
      url:       `https://reddit.com${c.data.permalink}`,
      subreddit,
    }));

    console.log(`[grove] Reddit r/${subreddit}: ${posts.length} posts`);
    setCached(cacheKey, posts);
    return posts;
  } catch (err) {
    console.error(
      `[grove] Reddit r/${subreddit} fetch error:`,
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchRedditForQuery(
  location:      string | undefined,
  mapsQuery:     string,
  originalQuery: string,
  cityHint?:     string       // Raw city name from GPS reverse-geocode (e.g. "Bangkok")
): Promise<RedditResult> {
  // Detect from parsed location, then cityHint, then mapsQuery
  const city = detectCity(location, cityHint) ??
               detectCity(cityHint, mapsQuery);

  let subs: string[];
  const rawCity = location ?? cityHint ?? "";

  if (city && CITY_MAP[city]) {
    subs = CITY_MAP[city];
  } else if (rawCity) {
    // Unknown city — auto-discover subreddits
    console.log(`[grove] Reddit: unknown city "${rawCity}", auto-discovering subreddits`);
    subs = await discoverSubredditsForCity(rawCity);
  } else {
    console.log("[grove] Reddit: no city detected, skipping community signals");
    return { posts: [], subreddits: [], city: "unknown" };
  }

  console.log(`[grove] Reddit: city="${city ?? rawCity}", subs=[${subs.join(", ")}]`);

  // Pull from all subreddits concurrently
  const results = await Promise.allSettled(
    subs.map((sub, i) =>
      fetchSubredditPosts(sub, i === 0 ? originalQuery : `food ${originalQuery}`)
    )
  );

  const all: RedditPost[] = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  return { posts: all, subreddits: subs, city: city ?? rawCity };
}

/**
 * Build a concise text summary of Reddit posts suitable for Claude context.
 */
export function buildRedditContext(result: RedditResult): string {
  if (result.posts.length === 0) return "";

  const subLabel = result.subreddits.map((s) => `r/${s}`).join(" + ");
  const lines    = result.posts.slice(0, 15).map((p) => {
    const snippet = p.text.trim() ? ` — "${p.text.slice(0, 200)}"` : "";
    return `• [r/${p.subreddit} ↑${p.score}] "${p.title}"${snippet}`;
  });

  return [
    `=== REDDIT COMMUNITY SIGNALS (${subLabel}) ===`,
    ...lines,
  ].join("\n");
}
