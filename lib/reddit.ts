/**
 * lib/reddit.ts — Community signals from Reddit
 *
 * Uses public Reddit JSON endpoints (no API key required).
 * Each city maps to 2-3 subreddits: food-specific + general city sub.
 * Results are cached for 24 hours.
 */

import { getCached, setCached } from "./cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RedditPost {
  title: string;
  text: string;
  score: number;
  url: string;
  subreddit: string;
}

export interface RedditResult {
  posts: RedditPost[];
  subreddits: string[];
  city: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours
const REDDIT_UA = "Grove/1.0 Food Discovery App (grove.sg)";

// city keyword → array of subreddits (food-first, then city/general)
const CITY_MAP: Record<string, string[]> = {
  // Singapore
  singapore:      ["SingaporeEats", "singapore"],
  sg:             ["SingaporeEats", "singapore"],
  bugis:          ["SingaporeEats", "singapore"],
  "orchard road": ["SingaporeEats", "singapore"],
  // Malaysia
  "kuala lumpur": ["malaysianfood", "kualalumpur"],
  kl:             ["malaysianfood", "kualalumpur"],
  malaysia:       ["malaysianfood", "malaysia"],
  penang:         ["malaysianfood", "malaysia"],
  // Indonesia
  jakarta:        ["IndonesianFood", "indonesia"],
  indonesia:      ["IndonesianFood", "indonesia"],
  bali:           ["IndonesianFood", "indonesia"],
  // Thailand
  bangkok:        ["ThaiFood", "thailand"],
  thailand:       ["ThaiFood", "thailand"],
  chiang:         ["ThaiFood", "thailand"],
  phuket:         ["ThaiFood", "thailand"],
  // Philippines
  manila:         ["phfood", "philippines"],
  philippines:    ["phfood", "philippines"],
  cebu:           ["phfood", "philippines"],
  // Hong Kong
  "hong kong":    ["HKfood", "HongKong"],
  hk:             ["HKfood", "HongKong"],
  // Japan
  tokyo:          ["JapanFood", "japan"],
  osaka:          ["JapanFood", "japan"],
  kyoto:          ["JapanFood", "japan"],
  japan:          ["JapanFood", "japan"],
  // South Korea
  seoul:          ["korean_food", "korea"],
  busan:          ["korean_food", "korea"],
  korea:          ["korean_food", "korea"],
  // Vietnam
  hanoi:          ["vietnamesefood", "VietNam"],
  "ho chi minh":  ["vietnamesefood", "VietNam"],
  hcmc:           ["vietnamesefood", "VietNam"],
  vietnam:        ["vietnamesefood", "VietNam"],
  // Taiwan
  taipei:         ["taiwanfood", "taiwan"],
  taiwan:         ["taiwanfood", "taiwan"],
  // Australia
  sydney:         ["sydney", "australianfood"],
  melbourne:      ["melbourne", "australianfood"],
  brisbane:       ["brisbane", "australianfood"],
  australia:      ["australianfood", "australia"],
  // UK
  london:         ["london", "britishfood"],
  uk:             ["london", "unitedkingdom"],
  // USA — New York (3 subreddits)
  "new york":     ["FoodNYC", "nycfood", "AskNYC"],
  nyc:            ["FoodNYC", "nycfood", "AskNYC"],
  brooklyn:       ["FoodNYC", "nycfood", "AskNYC"],
  manhattan:      ["FoodNYC", "nycfood", "AskNYC"],
  queens:         ["FoodNYC", "nycfood", "AskNYC"],
  bronx:          ["FoodNYC", "nycfood", "AskNYC"],
  // USA — Other cities
  "los angeles":  ["FoodLosAngeles", "LosAngeles"],
  la:             ["FoodLosAngeles", "LosAngeles"],
  "san francisco":["bayarea", "BayAreaFood"],
  chicago:        ["chicago", "chicagofood"],
};

// Food-related search keywords used when pulling community posts
const FOOD_KEYWORDS =
  "recommend best where to eat hidden gem supper lunch dinner must try";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function detectCity(
  location?: string,
  mapsQuery?: string
): string {
  const haystack = [location ?? "", mapsQuery ?? ""].join(" ").toLowerCase();
  // Longest-match first to avoid "la" matching "kuala lumpur"
  const keys = Object.keys(CITY_MAP).sort((a, b) => b.length - a.length);
  for (const city of keys) {
    if (haystack.includes(city)) return city;
  }
  return "singapore";
}

async function discoverSubredditsForCity(
  city: string
): Promise<string[]> {
  const cacheKey = `reddit_subs_discovery_${city}`;
  const cached = getCached<string[]>(cacheKey, 7 * 24 * 60 * 60 * 1000);
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
  const cached = getCached<RedditPost[]>(cacheKey, TTL_MS);
  if (cached) return cached;

  const searchTerms = query.trim() || FOOD_KEYWORDS;
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(
    searchTerms
  )}&sort=top&limit=25&restrict_sr=true`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": REDDIT_UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];

    const json = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posts: RedditPost[] = (json.data?.children ?? []).map((c: any) => ({
      title:     c.data.title     ?? "",
      text:      (c.data.selftext ?? "").slice(0, 800),
      score:     c.data.score     ?? 0,
      url:       `https://reddit.com${c.data.permalink}`,
      subreddit,
    }));

    setCached(cacheKey, posts);
    return posts;
  } catch {
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchRedditForQuery(
  location: string | undefined,
  mapsQuery: string,
  originalQuery: string
): Promise<RedditResult> {
  const city = detectCity(location, mapsQuery);
  const subs = CITY_MAP[city] ?? (await discoverSubredditsForCity(city));

  // Pull from all subreddits concurrently (supports 2 or 3)
  const results = await Promise.allSettled(
    subs.map((sub, i) =>
      fetchSubredditPosts(sub, i === 0 ? originalQuery : `food ${originalQuery}`)
    )
  );

  const all: RedditPost[] = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  return { posts: all, subreddits: subs, city };
}

/**
 * Build a concise text summary of Reddit posts suitable for Claude context.
 */
export function buildRedditContext(result: RedditResult): string {
  if (result.posts.length === 0) return "";

  const subLabel = result.subreddits.map((s) => `r/${s}`).join(" + ");
  const lines = result.posts.slice(0, 15).map((p) => {
    const snippet = p.text.trim() ? ` — "${p.text.slice(0, 200)}"` : "";
    return `• [r/${p.subreddit} ↑${p.score}] "${p.title}"${snippet}`;
  });

  return [
    `=== REDDIT COMMUNITY SIGNALS (${subLabel}) ===`,
    ...lines,
  ].join("\n");
}
