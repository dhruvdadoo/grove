/**
 * lib/foodblogs.ts — Food blog scraper
 *
 * Scrapes curated Singapore & regional food blogs for place recommendations.
 * Only targets WordPress-based and SSR sites (static HTML search pages).
 * JS-rendered SPAs (Burpple, etc.) are skipped — they require a headless browser.
 *
 * Scraping rules:
 *  • Respects robots.txt intention — only fetches public search pages
 *  • Hard 8-second timeout per request to avoid blocking search
 *  • Results cached for 7 days — fetching only happens on cache miss
 *  • Source attribution included with every result
 */

import { getCached, setCached } from "./cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlogPost {
  title:  string;
  url:    string;
  source: string;
}

interface BlogSource {
  name:      string;
  city:      string;
  searchUrl: (q: string) => string;
}

// ─── Blog source registry ─────────────────────────────────────────────────────

const BLOG_SOURCES: BlogSource[] = [
  // ── Singapore ──────────────────────────────────────────────────────────────
  {
    name:      "ieatishootipost",
    city:      "singapore",
    searchUrl: (q) => `https://ieatishootipost.sg/?s=${encodeURIComponent(q)}`,
  },
  {
    name:      "misstamchiak",
    city:      "singapore",
    searchUrl: (q) => `https://www.misstamchiak.com/?s=${encodeURIComponent(q)}`,
  },
  {
    name:      "danielfooddiary",
    city:      "singapore",
    searchUrl: (q) => `https://www.danielfooddiary.com/?s=${encodeURIComponent(q)}`,
  },
  {
    name:      "sethlui",
    city:      "singapore",
    searchUrl: (q) => `https://sethlui.com/?s=${encodeURIComponent(q)}`,
  },
  {
    name:      "eatbook",
    city:      "singapore",
    searchUrl: (q) => `https://eatbook.sg/?s=${encodeURIComponent(q)}`,
  },
  {
    name:      "ladyironchef",
    city:      "singapore",
    searchUrl: (q) => `https://www.ladyironchef.com/?s=${encodeURIComponent(q)}`,
  },
  {
    name:      "thesmartlocal-sg",
    city:      "singapore",
    searchUrl: (q) =>
      `https://thesmartlocal.com/singapore/?s=${encodeURIComponent(q)}`,
  },
  // ── Malaysia ───────────────────────────────────────────────────────────────
  {
    name:      "eatdrinkKL",
    city:      "malaysia",
    searchUrl: (q) =>
      `https://eatdrinkkl.blogspot.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    name:      "thesmartlocal-my",
    city:      "malaysia",
    searchUrl: (q) =>
      `https://thesmartlocal.com/malaysia/?s=${encodeURIComponent(q)}`,
  },
  // ── Thailand ───────────────────────────────────────────────────────────────
  {
    name:      "eatingthaifood",
    city:      "thailand",
    searchUrl: (q) =>
      `https://www.eatingthaifood.com/?s=${encodeURIComponent(q)}`,
  },
  // ── Hong Kong ──────────────────────────────────────────────────────────────
  {
    name:      "openrice-hk",
    city:      "hongkong",
    searchUrl: (q) =>
      `https://www.openrice.com/en/hongkong/restaurants?what=${encodeURIComponent(q)}`,
  },
  // ── Philippines ────────────────────────────────────────────────────────────
  {
    name:      "thesmartlocal-ph",
    city:      "philippines",
    searchUrl: (q) =>
      `https://thesmartlocal.com/philippines/?s=${encodeURIComponent(q)}`,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCRAPER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Extract article titles + URLs from raw HTML.
 * Matches common WordPress search result patterns.
 */
function extractTitlesFromHtml(
  html: string,
  sourceName: string
): BlogPost[] {
  const posts: BlogPost[] = [];

  // Pattern 1: <h2 class="entry-title"><a href="...">Title</a></h2>  (WordPress classic)
  // Pattern 2: <h3 class="post-title"><a href="...">Title</a></h3>
  // Pattern 3: <a class="entry-title-link" href="...">Title</a>
  // Pattern 4: <article ...><a href="https://...">Short Title (10-120 chars)</a>
  const patterns = [
    /<h[1-4][^>]*class="[^"]*(?:entry-title|post-title|article-title|item-title)[^"]*"[^>]*>(?:[^<]|<(?!\/h))*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]{5,200}?)<\/a>/gi,
    /<a[^>]*class="[^"]*(?:entry-title-link|post-title-link|article-title-link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]{5,200}?)<\/a>/gi,
    /<a[^>]*href="(https?:\/\/[^"]{10,})"[^>]*>([^<]{10,120})<\/a>/g,
  ];

  const seen = new Set<string>();

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && posts.length < 10) {
      const url   = m[1] ?? "";
      const title = (m[2] ?? "")
        .replace(/<[^>]+>/g, "")   // strip inner tags
        .replace(/&amp;/g, "&")
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;|&#8221;/g, '"')
        .replace(/\s+/g, " ")
        .trim();

      if (title.length > 5 && url.startsWith("http") && !seen.has(url)) {
        seen.add(url);
        posts.push({ title, url, source: sourceName });
      }
    }
    if (posts.length >= 5) break;
  }

  return posts.slice(0, 8);
}

// ─── Per-source fetch ────────────────────────────────────────────────────────

async function fetchBlogSource(
  source: BlogSource,
  query: string
): Promise<BlogPost[]> {
  const cacheKey = `blog_${source.name}_${query.replace(/\W+/g, "_").slice(0, 50)}`;
  const cached = getCached<BlogPost[]>(cacheKey, TTL_MS);
  if (cached) return cached;

  try {
    const res = await fetch(source.searchUrl(query), {
      headers: { "User-Agent": SCRAPER_UA, Accept: "text/html" },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];

    const html  = await res.text();
    const posts = extractTitlesFromHtml(html, source.name);

    setCached(cacheKey, posts);
    return posts;
  } catch {
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Map a parsed location/city to blog city keys used above.
 */
function detectBlogCity(location?: string, mapsQuery?: string): string {
  const h = [location ?? "", mapsQuery ?? ""].join(" ").toLowerCase();
  if (h.includes("malaysia") || h.includes("kuala lumpur") || h.includes(" kl")) return "malaysia";
  if (h.includes("bangkok")  || h.includes("thailand"))  return "thailand";
  if (h.includes("hong kong") || h.includes(" hk "))     return "hongkong";
  if (h.includes("manila")   || h.includes("philippines")) return "philippines";
  return "singapore";
}

/**
 * Fetch blog posts relevant to a search.
 * Selects 3-5 sources for the detected city and fetches them concurrently.
 * Returns a deduplicated list of post titles + URLs.
 */
export async function fetchFoodBlogPosts(
  query: string,
  location?: string,
  mapsQuery?: string,
  maxSources = 4
): Promise<BlogPost[]> {
  const city    = detectBlogCity(location, mapsQuery);
  const sources = BLOG_SOURCES.filter((s) => s.city === city).slice(0, maxSources);

  if (sources.length === 0) return [];

  const results = await Promise.allSettled(
    sources.map((s) => fetchBlogSource(s, query))
  );

  const seen  = new Set<string>();
  const posts: BlogPost[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const p of r.value) {
      if (!seen.has(p.url)) {
        seen.add(p.url);
        posts.push(p);
      }
    }
  }

  return posts.slice(0, 20);
}

/**
 * Build a short text summary of blog posts for Claude context.
 */
export function buildBlogContext(posts: BlogPost[]): string {
  if (posts.length === 0) return "";

  const lines = posts
    .slice(0, 12)
    .map((p) => `• [${p.source}] "${p.title}" — ${p.url}`);

  return ["=== FOOD BLOG SIGNALS ===", ...lines].join("\n");
}
