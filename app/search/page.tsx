"use client";

import { Suspense, useState, useEffect, useMemo, useRef, KeyboardEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import ResultCard from "@/components/ResultCard";
import { mockRestaurants } from "@/lib/mockData";
import type { Restaurant } from "@/lib/mockData";
import type { ParsedQuery } from "@/lib/claude";

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTERS = ["All", "Halal", "Open Now", "Under $15", "Hawker", "Near Me"] as const;
type FilterOption = typeof FILTERS[number];

function getTimePeriod(hour: number): { label: string; emoji: string } {
  if (hour < 10) return { label: "Breakfast time",  emoji: "☀️" };
  if (hour < 14) return { label: "Lunch hour",       emoji: "🍱" };
  if (hour < 17) return { label: "Afternoon",        emoji: "☕" };
  if (hour < 21) return { label: "Dinner time",      emoji: "🍽️" };
  return              { label: "Supper time",        emoji: "🌙" };
}

type SortOption = "relevance" | "distance" | "price_asc" | "price_desc" | "rating";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "relevance",  label: "Relevance" },
  { value: "distance",   label: "Distance (nearest first)" },
  { value: "price_asc",  label: "Price (low to high)" },
  { value: "price_desc", label: "Price (high to low)" },
  { value: "rating",     label: "Rating (highest first)" },
];

// ─── Intent chip builder ──────────────────────────────────────────────────────

interface Chip {
  label: string;
  color: "green" | "amber" | "blue" | "purple" | "rose";
}

function buildChips(parsed: ParsedQuery): Chip[] {
  const chips: Chip[] = [];

  if (parsed.location)
    chips.push({ label: parsed.location, color: "blue" });

  parsed.dietary.forEach((d) => chips.push({ label: d, color: "green" }));

  if (parsed.priceTier === "budget")        chips.push({ label: "$ Budget",      color: "green" });
  else if (parsed.priceTier === "mid")      chips.push({ label: "$$ Mid-range",  color: "amber" });
  else if (parsed.priceTier === "splurge")  chips.push({ label: "$$$ Splurge",   color: "purple" });

  if (parsed.priceMax) chips.push({ label: `Under $${parsed.priceMax}`, color: "amber" });
  if (parsed.openNow)  chips.push({ label: "Open now",                  color: "green" });

  if (parsed.afterHour !== undefined) {
    const h = parsed.afterHour;
    const period = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    chips.push({ label: `After ${h12}${period}`, color: "blue" });
  }

  if (parsed.cuisine)   chips.push({ label: parsed.cuisine,   color: "amber" });
  if (parsed.placeType) chips.push({ label: parsed.placeType, color: "blue" });

  parsed.vibe.forEach((v)      => chips.push({ label: v, color: "purple" }));
  parsed.practical.forEach((p) => chips.push({ label: p, color: "blue" }));
  parsed.discovery.forEach((d) => chips.push({ label: d, color: "rose" }));

  return chips;
}

const CHIP_STYLES: Record<Chip["color"], React.CSSProperties> = {
  green:  { background: "#EDFBF3", color: "#1A6B40", border: "1px solid #B6EDD0" },
  amber:  { background: "#FFF8EC", color: "#8B5C1A", border: "1px solid #F5D9A0" },
  blue:   { background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" },
  purple: { background: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE" },
  rose:   { background: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" },
};

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "#FFFFFF", borderColor: "#E8E4DF", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
    >
      {/* Image placeholder */}
      <div className="animate-pulse" style={{ height: "160px", background: "#F0EDE8" }} />

      {/* Content */}
      <div style={{ padding: "16px 20px 20px" }}>
        <div className="flex justify-between mb-2">
          <div className="flex-1 space-y-2">
            <div className="h-5 rounded-lg animate-pulse" style={{ background: "#F0EDE8", width: "65%" }} />
            <div className="h-3 rounded animate-pulse"   style={{ background: "#F0EDE8", width: "45%" }} />
          </div>
          <div className="h-4 w-10 rounded animate-pulse ml-3" style={{ background: "#F0EDE8" }} />
        </div>
        <div className="h-3 rounded animate-pulse mb-3" style={{ background: "#F0EDE8", width: "55%" }} />
        {/* Chips row */}
        <div className="flex gap-1.5 mb-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-5 w-16 rounded-full animate-pulse" style={{ background: "#F0EDE8" }} />
          ))}
        </div>
        <div className="rounded-xl p-3 mb-4" style={{ background: "#F5F8F6", border: "1px solid #DCE9E3" }}>
          <div className="h-2.5 rounded animate-pulse mb-2"  style={{ background: "#DCE9E3", width: "40%" }} />
          <div className="h-3 rounded animate-pulse mb-1.5"  style={{ background: "#DCE9E3", width: "100%" }} />
          <div className="h-3 rounded animate-pulse"          style={{ background: "#DCE9E3", width: "80%" }} />
        </div>
        {[0, 1].map((row) => (
          <div key={row} className={`flex gap-1.5 ${row === 1 ? "mt-1.5" : ""}`}>
            {[0, 1, 2].map((col) => (
              <div key={col} className="flex-1 h-8 rounded-full animate-pulse" style={{ background: "#F0EDE8" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ranking indicator ────────────────────────────────────────────────────────

function RankingIndicator() {
  return (
    <div className="col-span-full flex items-center justify-center gap-2 py-5">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ background: "#2D4A3E" }}
      />
      <span className="font-sans text-sm" style={{ color: "#6B6561" }}>
        Ranking results with AI…
      </span>
    </div>
  );
}

// ─── Main search results component ────────────────────────────────────────────

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const query    = searchParams.get("q")    ?? "";
  const cityHint = searchParams.get("city") ?? "";
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");

  const [searchInput, setSearchInput]   = useState(query);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("All");
  const [sortBy, setSortBy]             = useState<SortOption>("relevance");
  const [restaurants, setRestaurants]   = useState<Restaurant[]>([]);
  // "thinking" = no results yet (show skeletons + thinking text)
  // "partial"  = preliminary results visible, AI ranking in progress
  // "done"     = final results shown
  const [phase, setPhase]               = useState<"thinking" | "partial" | "done">("thinking");
  const [error, setError]               = useState<string | null>(null);
  const [isLive, setIsLive]             = useState(false);
  const [parsed, setParsed]             = useState<ParsedQuery | null>(null);
  const [sortOpen, setSortOpen]         = useState(false);
  const [currentHour, setCurrentHour]   = useState<number | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  // Capture current hour client-side (avoids SSR mismatch)
  useEffect(() => { setCurrentHour(new Date().getHours()); }, []);

  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(() => {
    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    return null;
  });

  // Load GPS from localStorage or browser
  useEffect(() => {
    if (userCoords) return;

    try {
      const cached = localStorage.getItem("grove_location");
      if (cached) {
        const loc = JSON.parse(cached);
        if (typeof loc.lat === "number" && typeof loc.lng === "number") {
          setUserCoords({ lat: loc.lat, lng: loc.lng });
          return;
        }
      }
    } catch { /* ignore */ }

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { /* silently ignore */ },
        { maximumAge: 60_000, timeout: 5_000, enableHighAccuracy: false }
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSearchInput(query); }, [query]);

  // ── Streaming fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!query) return;

    setPhase("thinking");
    setError(null);
    setIsLive(false);
    setParsed(null);
    setRestaurants([]);
    setActiveFilter("All");

    const params = new URLSearchParams({ q: query });
    if (cityHint)   params.set("city", cityHint);
    if (userCoords) {
      params.set("lat", userCoords.lat.toString());
      params.set("lng", userCoords.lng.toString());
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) throw new Error(`API ${res.status}`);

        const contentType = res.headers.get("content-type") ?? "";

        if (contentType.includes("application/x-ndjson") && res.body) {
          // ── Streaming path ────────────────────────────────────────────────
          const reader  = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer    = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.trim() || cancelled) continue;
              try {
                const chunk = JSON.parse(line) as {
                  type: string;
                  parsed?: ParsedQuery;
                  restaurants?: Restaurant[];
                  partial?: boolean;
                  count?: number;
                  message?: string;
                };

                if (chunk.type === "meta" && chunk.parsed) {
                  // Claude has parsed the query — show interpretation strip
                  setParsed(chunk.parsed);
                  // Stay in "thinking" until we have actual results

                } else if (chunk.type === "results" && chunk.restaurants) {
                  if (chunk.restaurants.length > 0) {
                    setRestaurants(chunk.restaurants as Restaurant[]);
                    setIsLive(true);
                    setPhase(chunk.partial ? "partial" : "done");
                  } else if (!chunk.partial) {
                    // Final results came back empty
                    setRestaurants(mockRestaurants);
                    setError("No live results found — showing sample data.");
                    setPhase("done");
                  }

                } else if (chunk.type === "done") {
                  setPhase("done");

                } else if (chunk.type === "error") {
                  throw new Error(chunk.message ?? "Search failed");
                }
              } catch { /* skip malformed chunk */ }
            }
          }

        } else {
          // ── Cached JSON path (instant) ────────────────────────────────────
          const data = await res.json() as {
            parsed?: ParsedQuery;
            restaurants?: Restaurant[];
          };
          if (cancelled) return;
          if (data.parsed) setParsed(data.parsed);
          if (data.restaurants && data.restaurants.length > 0) {
            setRestaurants(data.restaurants);
            setIsLive(true);
          } else {
            setRestaurants(mockRestaurants);
            setError("No live results found — showing sample data.");
          }
          setPhase("done");
        }
      } catch {
        if (cancelled) return;
        setRestaurants(mockRestaurants);
        setError("Could not load live results — showing sample data.");
        setPhase("done");
      }
    })();

    return () => { cancelled = true; };
  }, [query, cityHint, userCoords]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close sort dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const displayedRestaurants = useMemo(() => {
    let list = [...restaurants];

    switch (activeFilter) {
      case "Halal":
        list = list.filter(
          (r) => r.tags?.includes("Halal") || r.cuisine?.toLowerCase().includes("halal")
        );
        break;
      case "Open Now":
        list = list.filter((r) => r.isOpen);
        break;
      case "Under $15":
        list = list.filter((r) => r.priceRange === 1);
        break;
      case "Hawker":
        list = list.filter(
          (r) =>
            r.isHawkerCentre ||
            r.tags?.includes("Hawker Centre") ||
            r.cuisine?.toLowerCase().includes("hawker")
        );
        break;
      case "Near Me":
        list = list.filter((r) => r.distanceM > 0 && r.distanceM <= 1000);
        break;
    }

    switch (sortBy) {
      case "distance":
        list.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
        break;
      case "price_asc":
        list.sort((a, b) => a.priceRange - b.priceRange);
        break;
      case "price_desc":
        list.sort((a, b) => b.priceRange - a.priceRange);
        break;
      case "rating":
        list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
    }

    return list;
  }, [restaurants, activeFilter, sortBy]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleSearch = () => {
    if (!searchInput.trim()) return;
    const params = new URLSearchParams({ q: searchInput.trim() });
    if (cityHint)   params.set("city", cityHint);
    if (userCoords) {
      params.set("lat", userCoords.lat.toString());
      params.set("lng", userCoords.lng.toString());
    }
    router.push(`/search?${params.toString()}`);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const chips           = parsed ? buildChips(parsed) : [];
  const activeSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Relevance";
  const hasResults      = restaurants.length > 0;

  return (
    <div className="min-h-screen" style={{ background: "#FAF8F5" }}>
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20"
        style={{
          background:     "rgba(250,248,245,0.95)",
          backdropFilter: "blur(8px)",
          borderBottom:   "1px solid #E8E4DF",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="font-serif flex-shrink-0 transition-opacity duration-150 hover:opacity-70"
            style={{ fontSize: "26px", color: "#2D4A3E", fontWeight: 400, letterSpacing: "-0.01em", textDecoration: "none" }}
          >
            grove
          </Link>

          <div
            className="flex-1 flex items-center gap-2 transition-all duration-200"
            style={{
              background:   "#FFFFFF",
              border:       "1px solid #E8E4DF",
              borderRadius: "9999px",
              padding:      "8px 8px 8px 16px",
              boxShadow:    "0 1px 3px rgba(0,0,0,0.04)",
            }}
            onFocusCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "#2D4A3E";
              el.style.boxShadow   = "0 0 0 3px rgba(45,74,62,0.08)";
            }}
            onBlurCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "#E8E4DF";
              el.style.boxShadow   = "0 1px 3px rgba(0,0,0,0.04)";
            }}
          >
            <svg className="flex-shrink-0" width="15" height="15" fill="none" stroke="#9B9590"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKey}
              className="flex-1 bg-transparent outline-none font-sans min-w-0"
              style={{ fontSize: "14px", color: "#1A1A1A", caretColor: "#2D4A3E" }}
            />
            <button
              onClick={handleSearch}
              className="flex-shrink-0 font-sans font-medium transition-colors duration-150"
              style={{
                background: "#2D4A3E", color: "#FFFFFF", borderRadius: "9999px",
                padding: "7px 18px", fontSize: "13px", border: "none", cursor: "pointer",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#1E3329")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#2D4A3E")}
            >
              Search
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* AI interpretation strip */}
        <div
          className="inline-flex items-center gap-2 mb-4 px-4 py-3 rounded-xl"
          style={{ background: "#F5F8F6", border: "1px solid #DCE9E3" }}
        >
          {phase === "thinking" && !parsed ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: "#2D4A3E" }} />
              <span className="font-sans" style={{ fontSize: "13px", color: "#3D5248" }}>
                <span style={{ fontWeight: 500 }}>Thinking…</span>
                {" "}understanding your search &amp; querying live data
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: "13px", color: "#2D4A3E" }}>✦</span>
              <span className="font-sans" style={{ fontSize: "13px", color: "#3D5248" }}>
                <span style={{ fontWeight: 500 }}>{isLive ? "Grove understood:" : "Showing:"}</span>
                {" "}{parsed?.interpretation ?? `"${query}"`}
              </span>
            </>
          )}
        </div>

        {/* Intent chips */}
        {parsed && chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {chips.map((chip, i) => (
              <span key={i} className="text-xs font-sans font-medium px-3 py-1 rounded-full" style={CHIP_STYLES[chip.color]}>
                {chip.label}
              </span>
            ))}
          </div>
        )}

        {/* Error notice */}
        {error && phase === "done" && (
          <div
            className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl"
            style={{ background: "#FFF8EC", border: "1px solid #F5D9A0", display: "inline-flex" }}
          >
            <span style={{ fontSize: "13px", color: "#8B5C1A" }}>⚠</span>
            <span className="font-sans" style={{ fontSize: "12px", color: "#8B5C1A" }}>{error}</span>
          </div>
        )}

        {/* Results meta + sort */}
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h2
              className="font-serif"
              style={{ fontSize: "clamp(20px, 3vw, 26px)", color: "#1A1A1A", fontWeight: 400, letterSpacing: "-0.01em" }}
            >
              Results for <span style={{ color: "#2D4A3E" }}>&ldquo;{query}&rdquo;</span>
            </h2>
            <p className="font-sans mt-1" style={{ fontSize: "13px", color: "#9B9590" }}>
              {!hasResults
                ? "Searching live data…"
                : `${displayedRestaurants.length} place${displayedRestaurants.length !== 1 ? "s" : ""}${activeFilter !== "All" ? ` · ${activeFilter}` : ""}${userCoords ? " · Using your location" : ""}`}
            </p>
          </div>

          {/* Sort dropdown */}
          {hasResults && (
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setSortOpen((o) => !o)}
                className="font-sans flex items-center gap-2"
                style={{
                  fontSize: "13px", padding: "7px 14px", borderRadius: "9999px",
                  border: "1px solid #E8E4DF", background: "#FFFFFF", color: "#6B6561",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M7 12h10M11 18h2"/>
                </svg>
                {activeSortLabel}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>

              {sortOpen && (
                <div
                  className="absolute right-0 mt-1 rounded-xl overflow-hidden"
                  style={{
                    zIndex: 9999, background: "#FFFFFF",
                    border: "1px solid #E8E4DF",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)",
                    minWidth: "210px", top: "100%",
                  }}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                      className="font-sans w-full text-left"
                      style={{
                        padding: "11px 16px", fontSize: "13px",
                        color: sortBy === opt.value ? "#2D4A3E" : "#3D3D3D",
                        fontWeight: sortBy === opt.value ? 600 : 400,
                        background: sortBy === opt.value ? "#F5F8F6" : "transparent",
                        border: "none", cursor: "pointer", display: "block",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#F5F8F6")}
                      onMouseLeave={(e) => (
                        (e.currentTarget as HTMLElement).style.background =
                          sortBy === opt.value ? "#F5F8F6" : "transparent"
                      )}
                    >
                      {opt.label}
                      {sortBy === opt.value && <span style={{ float: "right", color: "#2D4A3E" }}>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap mb-3">
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className="font-sans font-medium transition-all duration-150"
                style={{
                  fontSize: "13px", padding: "7px 16px", borderRadius: "9999px",
                  border:   isActive ? "1px solid #2D4A3E" : "1px solid #E8E4DF",
                  background: isActive ? "#2D4A3E" : "#FFFFFF",
                  color:      isActive ? "#FFFFFF" : "#6B6561",
                  cursor:     "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "#2D4A3E";
                    el.style.color = "#2D4A3E";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = "#E8E4DF";
                    el.style.color = "#6B6561";
                  }
                }}
              >
                {filter}
              </button>
            );
          })}
        </div>

        {/* Time context chip — subtle suggestion based on current time */}
        {currentHour !== null && (() => {
          const { label, emoji } = getTimePeriod(currentHour);
          return (
            <div className="flex items-center gap-2 mb-6">
              <span
                className="font-sans inline-flex items-center gap-1.5"
                style={{
                  fontSize: "12px", color: "#9B9590",
                  background: "#F5F2EE", border: "1px solid #E8E4DF",
                  borderRadius: "9999px", padding: "4px 12px",
                }}
              >
                <span>{emoji}</span>
                <span>{label}</span>
              </span>
              <span className="font-sans text-xs" style={{ color: "#C4C0BB" }}>
                · Results are time-aware
              </span>
            </div>
          );
        })()}

        {/* Empty filter state */}
        {phase !== "thinking" && displayedRestaurants.length === 0 && hasResults && (
          <div className="rounded-2xl border p-8 text-center" style={{ background: "#FFFFFF", borderColor: "#E8E4DF" }}>
            <p className="font-serif text-lg mb-1" style={{ color: "#1A1A1A" }}>No results for this filter</p>
            <p className="font-sans text-sm" style={{ color: "#9B9590" }}>
              Try a different filter or{" "}
              <button
                onClick={() => setActiveFilter("All")}
                style={{ color: "#2D4A3E", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
              >
                show all results
              </button>
            </p>
          </div>
        )}

        {/* Results grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {!hasResults
            // No results yet — show skeleton loaders
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            // Results available — show cards
            : displayedRestaurants.map((r) => (
                <ResultCard key={r.id} restaurant={r} city={cityHint || "Singapore"} />
              ))
          }

          {/* Ranking indicator — shown while AI is reranking in background */}
          {phase === "partial" && hasResults && <RankingIndicator />}
        </div>

        <div className="h-16" />
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAF8F5" }}>
          <span className="font-serif" style={{ color: "#2D4A3E", fontSize: "24px", fontWeight: 400 }}>grove</span>
        </div>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
