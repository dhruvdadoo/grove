/**
 * lib/foodblogs.ts — Food blog scraper with RSS feed support + name extraction
 *
 * Pipeline:
 *  1. Try RSS/Atom feed first (reliable, standard XML format)
 *  2. Fall back to blog search page if RSS unavailable
 *  3. Filter posts by relevance to user query
 *  4. For list posts (Top 10, Best of…) fetch full content and extract all names
 *  5. Extract restaurant names from titles using multiple regex patterns
 *  6. Return enriched BlogPost[] — caller fuzzy-matches against Google Maps results
 *
 * Caching: 7-day in-memory TTL (RSS feeds / search pages don't change often)
 */

import { getCached, setCached } from "./cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BlogPost {
  title:          string;
  url:            string;
  source:         string;
  /** Potential restaurant names extracted from the title (or full content) */
  extractedNames: string[];
}

interface BlogSource {
  name:       string;
  city:       string;
  /** RSS/Atom feed URL (preferred — standard XML, no scraping issues) */
  feedUrl?:   string;
  /** Search-page URL fallback when no feed is available */
  searchUrl?: (q: string) => string;
}

// ─── Blog source registry ─────────────────────────────────────────────────────

const BLOG_SOURCES: BlogSource[] = [

  // ── Singapore ──────────────────────────────────────────────────────────────
  {
    name:      "danielfooddiary",
    city:      "singapore",
    // Search works well for this blog — keep as primary
    searchUrl: (q) => `https://www.danielfooddiary.com/?s=${encodeURIComponent(q)}`,
    feedUrl:   "https://www.danielfooddiary.com/feed/",
  },
  {
    name:    "ieatishootipost",
    city:    "singapore",
    feedUrl: "https://ieatishootipost.sg/feed/",
    searchUrl: (q) => `https://ieatishootipost.sg/?s=${encodeURIComponent(q)}`,
  },
  {
    name:    "misstamchiak",
    city:    "singapore",
    feedUrl: "https://www.misstamchiak.com/feed/",
    searchUrl: (q) => `https://www.misstamchiak.com/?s=${encodeURIComponent(q)}`,
  },
  {
    name:    "sethlui",
    city:    "singapore",
    feedUrl: "https://sethlui.com/feed/",
    searchUrl: (q) => `https://sethlui.com/?s=${encodeURIComponent(q)}`,
  },
  {
    name:    "eatbook",
    city:    "singapore",
    feedUrl: "https://eatbook.sg/feed/",
    searchUrl: (q) => `https://eatbook.sg/?s=${encodeURIComponent(q)}`,
  },
  {
    name:    "ladyironchef",
    city:    "singapore",
    feedUrl: "https://www.ladyironchef.com/feed/",
    searchUrl: (q) => `https://www.ladyironchef.com/?s=${encodeURIComponent(q)}`,
  },
  {
    name:    "thesmartlocal-sg",
    city:    "singapore",
    feedUrl: "https://thesmartlocal.com/singapore/feed/",
    searchUrl: (q) => `https://thesmartlocal.com/singapore/?s=${encodeURIComponent(q)}`,
  },
  {
    name:      "timeout-sg",
    city:      "singapore",
    searchUrl: (q) => `https://www.timeout.com/singapore/search?q=${encodeURIComponent(q)}`,
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
    feedUrl:   "https://thesmartlocal.com/malaysia/feed/",
    searchUrl: (q) => `https://thesmartlocal.com/malaysia/?s=${encodeURIComponent(q)}`,
  },

  // ── Thailand ───────────────────────────────────────────────────────────────
  {
    name:      "eatingthaifood",
    city:      "thailand",
    feedUrl:   "https://www.eatingthaifood.com/feed/",
    searchUrl: (q) => `https://www.eatingthaifood.com/?s=${encodeURIComponent(q)}`,
  },
  {
    name:      "timeout-bangkok",
    city:      "thailand",
    searchUrl: (q) => `https://www.timeout.com/bangkok/search?q=${encodeURIComponent(q)}`,
  },

  // ── Hong Kong ──────────────────────────────────────────────────────────────
  {
    name:      "openrice-hk",
    city:      "hongkong",
    searchUrl: (q) => `https://www.openrice.com/en/hongkong/restaurants?what=${encodeURIComponent(q)}`,
  },
  {
    name:      "timeout-hk",
    city:      "hongkong",
    searchUrl: (q) => `https://www.timeout.com/hong-kong/search?q=${encodeURIComponent(q)}`,
  },

  // ── Japan / Tokyo ──────────────────────────────────────────────────────────
  {
    name:      "timeout-tokyo",
    city:      "japan",
    searchUrl: (q) => `https://www.timeout.com/tokyo/search?q=${encodeURIComponent(q)}`,
  },

  // ── Philippines ────────────────────────────────────────────────────────────
  {
    name:      "thesmartlocal-ph",
    city:      "philippines",
    feedUrl:   "https://thesmartlocal.com/philippines/feed/",
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
  {
    name:      "timeout-nyc",
    city:      "newyork",
    searchUrl: (q) => `https://www.timeout.com/new-york/search?q=${encodeURIComponent(q)}`,
  },

  // ── London ─────────────────────────────────────────────────────────────────
  {
    name:      "timeout-london",
    city:      "london",
    searchUrl: (q) => `https://www.timeout.com/london/search?q=${encodeURIComponent(q)}`,
  },
  {
    name:      "infatuation-london",
    city:      "london",
    searchUrl: (q) => `https://www.theinfatuation.com/london/search?q=${encodeURIComponent(q)}`,
  },

  // ── Global / Michelin ──────────────────────────────────────────────────────
  // These are included for every city alongside city-specific sources
  {
    name:      "michelin-guide",
    city:      "global",
    searchUrl: (q) => `https://guide.michelin.com/en/restaurants?q=${encodeURIComponent(q)}`,
  },
];

// ─── RSS parsing ──────────────────────────────────────────────────────────────

interface RssItem {
  title:       string;
  url:         string;
  description: string;
}

/**
 * Parse a WordPress RSS/Atom feed (XML) into a list of items.
 * Handles both plain text and CDATA-wrapped content.
 */
function parseRssFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];

    const titleM = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    // Prefer <link> but fall back to <guid isPermaLink="true">
    const linkM  =
      block.match(/<link>(https?:[^<\s]+)<\/link>/)  ??
      block.match(/<guid[^>]*isPermaLink="true"[^>]*>(https?:[^<\s]+)<\/guid>/i);
    const descM  = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);

    if (!titleM || !linkM) continue;

    const clean = (s: string) =>
      s.replace(/&#(\d+);/g,  (_, n) => String.fromCharCode(parseInt(n, 10)))
       .replace(/&amp;/g,    "&")
       .replace(/&lt;/g,     "<")
       .replace(/&gt;/g,     ">")
       .replace(/&quot;/g,   '"')
       .replace(/&apos;/g,   "'")
       .replace(/<[^>]+>/g,  "")
       .trim();

    const title = clean(titleM[1]);
    const url   = linkM[1].trim();
    const desc  = descM ? clean(descM[1]).slice(0, 500) : "";

    if (title && url.startsWith("http")) {
      items.push({ title, url, description: desc });
    }
  }

  return items;
}

// ─── Restaurant name extraction ───────────────────────────────────────────────

/**
 * Detect whether a post title is a list/roundup rather than a single-restaurant review.
 * List posts need full content fetch to extract all restaurant names.
 */
function isListPost(title: string): boolean {
  return /\b(?:top\s*\d+|\d+\s+(?:best|must|places?|spots?|restaurants?|cafes?|hidden)|best\s+(?:\d+|places?|spots?|restaurants?|cafes?)|hidden\s+gems?|must.?tr(?:y|ies)|guide\s+to|where\s+to\s+eat|places?\s+to\s+eat|restaurants?\s+(?:in|you)|cafes?\s+(?:in|you))\b/i.test(title);
}

/**
 * Extract potential restaurant/place names from a single blog post title.
 * Prioritises specificity: extract the NAME before review/comparison text.
 */
function extractRestaurantNames(title: string): string[] {
  // Clean HTML entities
  const clean = title
    .replace(/&amp;/g,    "&")
    .replace(/&nbsp;/g,   " ")
    .replace(/&#8217;/g,  "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#\d+;/g,   "")
    .trim();

  const names: string[] = [];

  // Pattern 1a: "NAME Review" / "NAME Opens" / "NAME — ..." at the start
  const p1 = clean.match(
    /^([A-Z][\w\s&'.,\-+()]{2,60}?)\s+(?:review|opens?|opening|is now|has |makes|gets|wins|launches|returns|reopens)/i
  );
  if (p1) names.push(p1[1].trim());

  // Pattern 1b: "NAME – A Review" / "NAME: Review" / "NAME | Review"
  const p1b = clean.match(
    /^([A-Z][\w\s&'.,\-+()]{2,60}?)\s*[–—:|]\s*(?:a\s+)?(?:review|visit|first look)/i
  );
  if (p1b) names.push(p1b[1].trim());

  // Pattern 2: NAME before "Singapore" (common in SG blogs)
  const p2 = clean.match(
    /^([A-Z][\w\s&'.,\-+()]{2,60}?)\s*(?:,\s*)?Singapore\b/i
  );
  if (p2) names.push(p2[1].trim());

  // Pattern 3: "NAME — ..." or "NAME: ..." or "NAME | ..." separator at start
  const p3 = clean.match(/^([A-Z][\w\s&'.,\-+()]{3,60}?)\s*[–—:|]/);
  if (p3) names.push(p3[1].trim());

  // Pattern 4: "Review: NAME" or "Restaurant Review – NAME"
  const p4 = clean.match(
    /^(?:review|food review|restaurant review|cafe review|bar review|visiting?)\s*[:–—]\s*(.+)/i
  );
  if (p4) names.push(p4[1].split(/[,–—:|]/)[0].trim());

  // Pattern 5: "Best X at NAME" / "Dining at NAME" / "We tried NAME"
  const p5 = clean.match(
    /\b(?:at|visit(?:ed|ing)?|tried?|dined? at|eat(?:ing)? at|go(?:ing)? to)\s+([A-Z][\w\s&'.,\-+()]{2,50}?)(?:\s*[,–—:|!?]|\s+in\s|\s+for\s|$)/i
  );
  if (p5) names.push(p5[1].trim());

  // Pattern 6: whole title if it looks exactly like a restaurant name
  //   (2-6 words, starts with capital, no common filler words)
  const words = clean.split(/\s+/);
  const fillerRe =
    /^(best|top|where|how|why|what|when|guide|review|visit|try|taste|eat|food|must|new|check|first|last|hidden|secret|ultimate|complete|local|here|this|that|i |we |my |\d)/i;
  if (
    words.length >= 2 &&
    words.length <= 6 &&
    /^[A-Z]/.test(clean) &&
    !fillerRe.test(clean)
  ) {
    names.push(clean);
  }

  return [...new Set(names)]
    .map((n) =>
      n.replace(/^(at|the|a|an)\s+/i, "")
       .replace(/[.,']+$/, "")
       .trim()
    )
    .filter((n) => n.length >= 3 && n.length <= 80 && !/^\d/.test(n));
}

/**
 * For list posts, fetch the full HTML and extract restaurant names from headings
 * and numbered/bold list items. Returns up to 15 names.
 */
async function extractNamesFromFullContent(url: string, query: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": SCRAPER_UA, Accept: "text/html" },
      signal:  AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const names: string[] = [];

    const cleanText = (s: string) =>
      s.replace(/<[^>]+>/g, "")
       .replace(/&amp;/g, "&")
       .replace(/&#\d+;/g, "")
       .replace(/\s+/g, " ")
       .trim();

    // h2 / h3 / h4 headings (most list posts use these for each restaurant)
    const headingRe = /<h[234][^>]*>([\s\S]{5,150}?)<\/h[234]>/gi;
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(html)) !== null) {
      const text = cleanText(m[1]);
      // Strip leading number: "1. Restaurant Name" → "Restaurant Name"
      const candidate = text.replace(/^\d+[.):\s]+/, "").trim();
      if (
        candidate.length >= 3 &&
        candidate.length <= 80 &&
        /^[A-Z]/.test(candidate) &&
        !/^(best|top|why|what|where|how|the best)/i.test(candidate)
      ) {
        // Take only the part before a separator (dashes, pipes, colons)
        names.push(candidate.split(/\s*[–—:|]\s*/)[0].trim());
      }
    }

    // Bold/strong text in list items (secondary extraction)
    const boldRe = /<(?:strong|b)[^>]*>([^<]{3,60})<\/(?:strong|b)>/gi;
    while ((m = boldRe.exec(html)) !== null) {
      const text = cleanText(m[1]);
      if (
        text.length >= 3 &&
        /^[A-Z]/.test(text) &&
        !/^\d+\./.test(text) &&
        !names.some((n) => n.toLowerCase() === text.toLowerCase())
      ) {
        names.push(text);
      }
    }

    // Filter by query relevance (at least one word must appear)
    const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    const relevant   = names.filter((n) => {
      const nl = n.toLowerCase();
      return queryWords.length === 0 || queryWords.some((w) => nl.includes(w)) ||
        // Always keep names that look plausible even without query match
        names.length <= 5;
    });

    return [...new Set(relevant)].slice(0, 15);
  } catch {
    return [];
  }
}

// ─── Relevance filter ─────────────────────────────────────────────────────────

function isRelevantPost(title: string, query: string): boolean {
  const normTitle = title.toLowerCase();

  if (title.length < 10) return false;

  // Check against individual query words (min 3 chars)
  const terms = query.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (terms.some((t) => normTitle.includes(t))) return true;

  // Soft pass for common food-blog signal words
  const foodSignals = [
    "restaurant", "cafe", "hawker", "food", "eat", "dining", "review",
    "best", "try", "taste", "menu", "dish", "chef", "bistro", "izakaya",
    "ramen", "sushi", "brunch", "lunch", "dinner", "supper",
  ];
  return foodSignals.some((s) => normTitle.includes(s));
}

// ─── HTML title extractor (for search-page fallback) ──────────────────────────

const SCRAPER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

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
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
      if (title.length > 8 && url.startsWith("http") && !seen.has(url)) {
        seen.add(url);
        raw.push({ title, url });
      }
    }
    if (raw.length >= 15) break;
  }

  const posts: BlogPost[] = [];
  for (const { title, url } of raw) {
    if (!isRelevantPost(title, query)) continue;
    posts.push({ title, url, source: sourceName, extractedNames: extractRestaurantNames(title) });
    if (posts.length >= 8) break;
  }

  return posts;
}

// ─── Per-source fetch ─────────────────────────────────────────────────────────

const TTL_FEED_MS   = 7  * 24 * 60 * 60 * 1000; // 7 days for RSS feed
const TTL_SEARCH_MS = 7  * 24 * 60 * 60 * 1000; // 7 days for search pages
const TTL_FULL_MS   = 24 * 60 * 60 * 1000;       // 1 day for full post content

/**
 * Fetch a blog source — tries RSS feed first, falls back to search page.
 */
async function fetchBlogSource(source: BlogSource, query: string): Promise<BlogPost[]> {
  // Try RSS feed first (if defined)
  if (source.feedUrl) {
    const feedPosts = await fetchRssFeed(source, query);
    if (feedPosts.length > 0) return feedPosts;
  }

  // Fall back to search-page HTML scraping
  if (source.searchUrl) {
    return fetchSearchPage(source, query);
  }

  return [];
}

async function fetchRssFeed(source: BlogSource, query: string): Promise<BlogPost[]> {
  if (!source.feedUrl) return [];
  const cacheKey = `blog_feed_v3_${source.name}_${query.replace(/\W+/g, "_").slice(0, 50)}`;
  const cached   = getCached<BlogPost[]>(cacheKey, TTL_FEED_MS);
  if (cached) {
    console.log(`[grove] Blog ${source.name} feed cache hit: ${cached.length} posts`);
    return cached;
  }

  try {
    const res = await fetch(source.feedUrl, {
      headers: { "User-Agent": SCRAPER_UA, Accept: "application/rss+xml, application/xml, text/xml" },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error(`[grove] Blog ${source.name} feed HTTP ${res.status}`);
      return [];
    }

    const xml   = await res.text();
    const items = parseRssFeed(xml);

    // Filter to relevant posts only
    const relevantItems = items.filter((item) => isRelevantPost(item.title, query));

    const posts: BlogPost[] = [];
    for (const item of relevantItems.slice(0, 12)) {
      let extractedNames = extractRestaurantNames(item.title);

      // For list posts, also mine the description + optionally the full page
      if (isListPost(item.title)) {
        // First try names from the RSS description
        const descNames = extractRestaurantNames(item.description);
        extractedNames  = [...new Set([...extractedNames, ...descNames])];

        // If we found very few names from title/desc, fetch full content
        if (extractedNames.length < 3) {
          const fullContentKey = `blog_full_v1_${encodeURIComponent(item.url).slice(0, 80)}`;
          let fullNames = getCached<string[]>(fullContentKey, TTL_FULL_MS);
          if (!fullNames) {
            fullNames = await extractNamesFromFullContent(item.url, query);
            setCached(fullContentKey, fullNames);
          }
          extractedNames = [...new Set([...extractedNames, ...fullNames])];
        }
      }

      posts.push({
        title:          item.title,
        url:            item.url,
        source:         source.name,
        extractedNames: extractedNames.slice(0, 15),
      });
    }

    const withNames = posts.filter((p) => p.extractedNames.length > 0).length;
    console.log(
      `[grove] Blog ${source.name} (RSS): ${relevantItems.length} relevant posts, ` +
      `${posts.length} processed, ${withNames} with extractable restaurant names`
    );

    setCached(cacheKey, posts);
    return posts;
  } catch (err) {
    console.error(`[grove] Blog ${source.name} feed error:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchSearchPage(source: BlogSource, query: string): Promise<BlogPost[]> {
  if (!source.searchUrl) return [];
  const cacheKey = `blog_search_v3_${source.name}_${query.replace(/\W+/g, "_").slice(0, 50)}`;
  const cached   = getCached<BlogPost[]>(cacheKey, TTL_SEARCH_MS);
  if (cached) {
    console.log(`[grove] Blog ${source.name} search cache hit: ${cached.length} posts`);
    return cached;
  }

  try {
    const url = source.searchUrl(query);
    const res = await fetch(url, {
      headers: { "User-Agent": SCRAPER_UA, Accept: "text/html" },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error(`[grove] Blog ${source.name} search HTTP ${res.status}`);
      return [];
    }

    const html  = await res.text();
    const posts = extractTitlesFromHtml(html, source.name, query);

    // Enrich list posts with full content if possible
    for (const post of posts.filter((p) => isListPost(p.title) && p.extractedNames.length < 3)) {
      const fullNames = await extractNamesFromFullContent(post.url, query);
      post.extractedNames = [...new Set([...post.extractedNames, ...fullNames])].slice(0, 15);
    }

    const withNames = posts.filter((p) => p.extractedNames.length > 0).length;
    console.log(
      `[grove] Blog ${source.name} (search): ${posts.length} relevant posts, ` +
      `${withNames} with extractable restaurant names`
    );

    setCached(cacheKey, posts);
    return posts;
  } catch (err) {
    console.error(`[grove] Blog ${source.name} search error:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── City detection ───────────────────────────────────────────────────────────

function detectBlogCity(location?: string, mapsQuery?: string): string {
  const h = [location ?? "", mapsQuery ?? ""].join(" ").toLowerCase();

  if (h.includes("malaysia") || h.includes("kuala lumpur") || /\bkl\b/.test(h))
    return "malaysia";
  if (h.includes("bangkok") || h.includes("thailand") || h.includes("thai"))
    return "thailand";
  if (h.includes("hong kong") || /\bhk\b/.test(h))
    return "hongkong";
  if (h.includes("japan") || h.includes("tokyo") || h.includes("osaka") || h.includes("kyoto"))
    return "japan";
  if (h.includes("manila") || h.includes("philippines"))
    return "philippines";
  if (
    h.includes("new york") || h.includes("nyc") || h.includes("brooklyn") ||
    h.includes("manhattan") || h.includes("queens") || h.includes("bronx")
  )
    return "newyork";
  if (h.includes("london") || h.includes("soho") && h.includes("uk"))
    return "london";

  // Default to Singapore for undetected cities
  return "singapore";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchFoodBlogPosts(
  query:      string,
  location?:  string,
  mapsQuery?: string,
  maxSources = 5
): Promise<BlogPost[]> {
  const city        = detectBlogCity(location, mapsQuery);
  const citySources = BLOG_SOURCES.filter((s) => s.city === city).slice(0, maxSources);
  // Always add global sources (Michelin) alongside city sources
  const globalSources = BLOG_SOURCES.filter((s) => s.city === "global").slice(0, 2);
  const sources = [...citySources, ...globalSources];

  if (sources.length === 0) return [];

  console.log(`[grove] Blog sources for city "${city}": ${sources.map((s) => s.name).join(", ")}`);

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

  const withNames = posts.filter((p) => p.extractedNames.length > 0).length;
  console.log(
    `[grove] Blog total: ${posts.length} relevant posts across ${sources.length} sources, ` +
    `${withNames} with restaurant names`
  );

  return posts.slice(0, 20);
}

/**
 * Build a short text summary of blog posts for Claude context.
 */
export function buildBlogContext(posts: BlogPost[]): string {
  if (posts.length === 0) return "";

  const lines = posts.slice(0, 12).map((p) => {
    const names = p.extractedNames.length > 0
      ? ` [restaurant names: ${p.extractedNames.join(", ")}]`
      : "";
    return `• [${p.source}] "${p.title}"${names} — ${p.url}`;
  });

  return ["=== FOOD BLOG SIGNALS ===", ...lines].join("\n");
}
