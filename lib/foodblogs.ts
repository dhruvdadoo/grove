/**
 * lib/foodblogs.ts — Food blog scraper with name extraction & relevance filtering
 *
 * Pipeline:
 *  1. Fetch HTML from curated blog search pages (city-specific)
 *  2. Extract post titles + URLs using WordPress patterns
 *  3. Filter to only posts relevant to the search query
 *  4. Extract potential restaurant names from titles using regex patterns
 *  5. Return enriched BlogPost[] — caller matches names against Google Maps results
 *
 * Caching: in-memory TTL (7 days) so blog fetches are free on repeated searches.
 */

import { getCached, setCached } from "./cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlogPost {
  title:          string;
  url:            string;
  source:         string;
  /** Potential restaurant names extracted from the title */
  extractedNames: string[];
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
    searchUrl: (q) => `https://thesmartlocal.com/singapore/?s=${encodeURIComponent(q)}`,
  },
  // ── Malaysia ───────────────────────────────────────────────────────────────
  {
    name:      "eatdrinkKL",
    city:      "malaysia",
    searchUrl: (q) => `https://eatdrinkkl.blogspot.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    name:      "thesmartlocal-my",
    city:      "malaysia",
    searchUrl: (q) => `https://thesmartlocal.com/malaysia/?s=${encodeURIComponent(q)}`,
  },
  // ── Thailand ───────────────────────────────────────────────────────────────
  {
    name:      "eatingthaifood",
    city:      "thailand",
    searchUrl: (q) => `https://www.eatingthaifood.com/?s=${encodeURIComponent(q)}`,
  },
  // ── Hong Kong ──────────────────────────────────────────────────────────────
  {
    name:      "openrice-hk",
    city:      "hongkong",
    searchUrl: (q) => `https://www.openrice.com/en/hongkong/restaurants?what=${encodeURIComponent(q)}`,
  },
  // ── Philippines ────────────────────────────────────────────────────────────
  {
    name:      "thesmartlocal-ph",
    city:      "philippines",
    searchUrl: (q) => `https://thesmartlocal.com/philippines/?s=${encodeURIComponent(q)}`,
  },
  // ── New York City ──────────────────────────────────────────────────────────
  {
    name:      "eater-ny",
    city:      "newyork",
    searchUrl: (q) => `https://ny.eater.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    name:      "infatuation-nyc",
    city:      "newyork",
    searchUrl: (q) => `https://www.theinfatuation.com/new-york/search?q=${encodeURIComponent(q)}`,
  },
];

// ─── Name extraction ──────────────────────────────────────────────────────────

/**
 * Extract potential restaurant/place names from a blog post title.
 * Uses multiple regex patterns to cover common food blog title formats.
 */
function extractRestaurantNames(title: string): string[] {
  // Clean HTML entities
  const clean = title
    .replace(/&amp;/g,  "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#\d+;/g, "")
    .trim();

  const names: string[] = [];

  // Pattern 1: "NAME Review" / "NAME Opens" / "NAME — a..." at the start
  const p1 = clean.match(
    /^([A-Z][\w\s&'.,\-+]+?)\s+(?:review|opens?|opening|is now|has |makes|gets|wins|launches|celebrates|celebrates|returns|reopens|reimagines)/i
  );
  if (p1) names.push(p1[1].trim());

  // Pattern 2: "Best X at NAME" / "Dining at NAME" / "We tried NAME"
  const p2 = clean.match(
    /\b(?:at|visit(?:ed|ing)?|tried?|dine(?:d)? at|eat(?:ing)? at|go(?:ing)? to)\s+([A-Z][\w\s&'.,\-+]{2,50}?)(?:\s*[,–—:|!?]|\s+in\s|\s+for\s|$)/i
  );
  if (p2) names.push(p2[1].trim());

  // Pattern 3: "NAME — ..." or "NAME: ..." or "NAME | ..." separator at start
  const p3 = clean.match(/^([A-Z][\w\s&'.,\-+]{3,60}?)\s*[–—:|]/);
  if (p3) names.push(p3[1].trim());

  // Pattern 4: "Review: NAME" or "Restaurant Review – NAME"
  const p4 = clean.match(
    /^(?:review|food review|restaurant review|cafe review|bar review|visiting?)\s*[:–—]\s*(.+)/i
  );
  if (p4) {
    // Take the part before any further separator
    names.push(p4[1].split(/[,–—:|]/)[0].trim());
  }

  // Pattern 5: whole title if it looks exactly like a restaurant name
  //   (2-6 words, starts with capital, no filler question/list words)
  const words = clean.split(/\s+/);
  const fillerRe = /^(best|top|where|how|why|what|when|guide|review|visit|try|taste|eat|food|must|new|check|first|last|hidden|secret|ultimate|complete|local|here|this|that|\d)/i;
  const isNameLike =
    words.length >= 2 &&
    words.length <= 6 &&
    /^[A-Z]/.test(clean) &&
    !fillerRe.test(clean);
  if (isNameLike) names.push(clean);

  return [...new Set(names)]
    .map((n) => n.replace(/^(at|the|a|an)\s+/i, "").replace(/[.,']+$/, "").trim())
    .filter((n) => n.length >= 3 && n.length <= 80 && !/^\d/.test(n));
}

// ─── Relevance filter ─────────────────────────────────────────────────────────

/**
 * Returns true if the post title contains at least one meaningful search term.
 * Prevents irrelevant footer links / navigation items from passing through.
 */
function isRelevantPost(title: string, query: string): boolean {
  const normTitle = title.toLowerCase();

  // Must be at least 10 chars (filters out nav items, "Home", "About", etc.)
  if (title.length < 10) return false;

  // Check against individual query words (min 3 chars)
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  if (terms.some((t) => normTitle.includes(t))) return true;

  // Also check common food-blog signal words as a soft pass
  const foodSignals = ["restaurant", "cafe", "hawker", "food", "eat", "dining",
                       "review", "best", "try", "taste", "menu", "dish", "chef"];
  return foodSignals.some((s) => normTitle.includes(s));
}

// ─── HTML title extractor ─────────────────────────────────────────────────────

const SCRAPER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

/**
 * Extract article titles + URLs from raw HTML.
 * Matches common WordPress / blog search result patterns.
 */
function extractTitlesFromHtml(
  html:       string,
  sourceName: string,
  query:      string
): BlogPost[] {
  const raw: Array<{ title: string; url: string }> = [];

  const patterns = [
    // WordPress classic: <h2 class="entry-title"><a href="...">Title</a></h2>
    /<h[1-4][^>]*class="[^"]*(?:entry-title|post-title|article-title|item-title)[^"]*"[^>]*>(?:[^<]|<(?!\/h))*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]{5,200}?)<\/a>/gi,
    // Link class patterns
    /<a[^>]*class="[^"]*(?:entry-title-link|post-title-link|article-title-link)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]{5,200}?)<\/a>/gi,
    // Generic anchors with substantial text content
    /<a[^>]*href="(https?:\/\/[^"]{15,})"[^>]*>([^<]{15,120})<\/a>/g,
  ];

  const seen = new Set<string>();

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && raw.length < 30) {
      const url   = m[1] ?? "";
      const title = (m[2] ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&#8217;/g, "'")
        .replace(/&#8220;|&#8221;/g, '"')
        .replace(/\s+/g, " ")
        .trim();

      if (title.length > 8 && url.startsWith("http") && !seen.has(url)) {
        seen.add(url);
        raw.push({ title, url });
      }
    }
    if (raw.length >= 15) break;
  }

  // Apply relevance filter + name extraction
  const posts: BlogPost[] = [];
  for (const { title, url } of raw) {
    if (!isRelevantPost(title, query)) continue;
    posts.push({
      title,
      url,
      source:         sourceName,
      extractedNames: extractRestaurantNames(title),
    });
    if (posts.length >= 8) break;
  }

  return posts;
}

// ─── Per-source fetch ─────────────────────────────────────────────────────────

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function fetchBlogSource(
  source: BlogSource,
  query:  string
): Promise<BlogPost[]> {
  const cacheKey = `blog_v2_${source.name}_${query.replace(/\W+/g, "_").slice(0, 50)}`;
  const cached   = getCached<BlogPost[]>(cacheKey, TTL_MS);
  if (cached) {
    console.log(`[grove] Blog ${source.name} cache hit: ${cached.length} posts`);
    return cached;
  }

  try {
    const res = await fetch(source.searchUrl(query), {
      headers: { "User-Agent": SCRAPER_UA, Accept: "text/html" },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error(`[grove] Blog ${source.name} HTTP ${res.status}`);
      return [];
    }

    const html  = await res.text();
    const posts = extractTitlesFromHtml(html, source.name, query);

    const withNames = posts.filter((p) => p.extractedNames.length > 0).length;
    console.log(
      `[grove] Blog ${source.name}: ${posts.length} relevant posts, ` +
      `${withNames} with extractable restaurant names`
    );

    setCached(cacheKey, posts);
    return posts;
  } catch (err) {
    console.error(`[grove] Blog ${source.name} error:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── City detection ───────────────────────────────────────────────────────────

function detectBlogCity(location?: string, mapsQuery?: string): string {
  const h = [location ?? "", mapsQuery ?? ""].join(" ").toLowerCase();
  if (h.includes("malaysia")  || h.includes("kuala lumpur") || h.includes(" kl ")) return "malaysia";
  if (h.includes("bangkok")   || h.includes("thailand"))    return "thailand";
  if (h.includes("hong kong") || h.includes(" hk "))        return "hongkong";
  if (h.includes("manila")    || h.includes("philippines")) return "philippines";
  if (
    h.includes("new york") || h.includes("nyc") || h.includes("brooklyn") ||
    h.includes("manhattan") || h.includes("queens") || h.includes("bronx")
  ) return "newyork";
  return "singapore";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchFoodBlogPosts(
  query:      string,
  location?:  string,
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

  console.log(
    `[grove] Blog total: ${posts.length} relevant posts across ${sources.length} sources, ` +
    `${posts.filter((p) => p.extractedNames.length > 0).length} with restaurant names`
  );

  return posts.slice(0, 20);
}

/**
 * Build a short text summary of blog posts for Claude context.
 * Includes extracted restaurant names to help Claude make matches.
 */
export function buildBlogContext(posts: BlogPost[]): string {
  if (posts.length === 0) return "";

  const lines = posts.slice(0, 12).map((p) => {
    const names = p.extractedNames.length > 0
      ? ` [names: ${p.extractedNames.join(", ")}]`
      : "";
    return `• [${p.source}] "${p.title}"${names} — ${p.url}`;
  });

  return ["=== FOOD BLOG SIGNALS ===", ...lines].join("\n");
}
