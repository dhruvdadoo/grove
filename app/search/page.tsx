"use client";

import { Suspense, useState, useEffect, KeyboardEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import ResultCard from "@/components/ResultCard";
import { mockRestaurants } from "@/lib/mockData";
import type { Restaurant } from "@/lib/mockData";
import type { ParsedQuery } from "@/lib/claude";

// ─── Constants ────────────────────────────────────────────────────────────────

const FILTERS = ["All", "Halal", "Open Now", "Under $15", "Hawker", "Near Me"];

// ─── Intent chip builder ───────────────────────────────────────────────────────

interface Chip {
  label: string;
  color: "green" | "amber" | "blue" | "purple" | "rose";
}

function buildChips(parsed: ParsedQuery): Chip[] {
  const chips: Chip[] = [];

  if (parsed.location)
    chips.push({ label: `📍 ${parsed.location}`, color: "blue" });

  parsed.dietary.forEach((d) =>
    chips.push({ label: `✓ ${d}`, color: "green" })
  );

  if (parsed.priceTier === "budget")
    chips.push({ label: "$ Budget", color: "green" });
  else if (parsed.priceTier === "mid")
    chips.push({ label: "$$ Mid-range", color: "amber" });
  else if (parsed.priceTier === "splurge")
    chips.push({ label: "$$$ Splurge", color: "purple" });

  if (parsed.priceMax)
    chips.push({ label: `Under $${parsed.priceMax}`, color: "amber" });

  if (parsed.openNow)
    chips.push({ label: "Open now", color: "green" });

  if (parsed.afterHour !== undefined) {
    const h = parsed.afterHour;
    const period = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    chips.push({ label: `After ${h12}${period}`, color: "blue" });
  }

  if (parsed.cuisine)
    chips.push({ label: `🍜 ${parsed.cuisine}`, color: "amber" });

  if (parsed.placeType)
    chips.push({ label: `🏠 ${parsed.placeType}`, color: "blue" });

  parsed.vibe.forEach((v) =>
    chips.push({ label: `✨ ${v}`, color: "purple" })
  );

  parsed.practical.forEach((p) =>
    chips.push({ label: p, color: "blue" })
  );

  parsed.discovery.forEach((d) =>
    chips.push({ label: `💎 ${d}`, color: "rose" })
  );

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
      className="rounded-2xl border p-5"
      style={{
        background: "#FFFFFF",
        borderColor: "#E8E4DF",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {/* Name + price */}
      <div className="flex justify-between mb-3">
        <div className="flex-1 space-y-2">
          <div
            className="h-5 rounded-lg animate-pulse"
            style={{ background: "#F0EDE8", width: "65%" }}
          />
          <div
            className="h-3 rounded animate-pulse"
            style={{ background: "#F0EDE8", width: "45%" }}
          />
        </div>
        <div
          className="h-4 w-10 rounded animate-pulse ml-3"
          style={{ background: "#F0EDE8" }}
        />
      </div>
      {/* Status */}
      <div
        className="h-3 rounded animate-pulse mb-4"
        style={{ background: "#F0EDE8", width: "55%" }}
      />
      {/* Match reason box */}
      <div
        className="rounded-xl p-3 mb-4"
        style={{ background: "#F5F8F6", border: "1px solid #DCE9E3" }}
      >
        <div
          className="h-2.5 rounded animate-pulse mb-2"
          style={{ background: "#DCE9E3", width: "40%" }}
        />
        <div
          className="h-3 rounded animate-pulse mb-1.5"
          style={{ background: "#DCE9E3", width: "100%" }}
        />
        <div
          className="h-3 rounded animate-pulse"
          style={{ background: "#DCE9E3", width: "80%" }}
        />
      </div>
      {/* Buttons */}
      {[0, 1].map((row) => (
        <div key={row} className={`flex gap-1.5 ${row === 1 ? "mt-1.5" : ""}`}>
          {[0, 1, 2].map((col) => (
            <div
              key={col}
              className="flex-1 h-8 rounded-full animate-pulse"
              style={{ background: "#F0EDE8" }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Main search results component ────────────────────────────────────────────

function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query    = searchParams.get("q")    ?? "";
  const cityHint = searchParams.get("city") ?? "";

  const [searchInput, setSearchInput]   = useState(query);
  const [activeFilter, setActiveFilter] = useState("All");
  const [restaurants, setRestaurants]   = useState<Restaurant[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [isLive, setIsLive]             = useState(false);
  const [parsed, setParsed]             = useState<ParsedQuery | null>(null);

  // Sync input with URL param when navigating
  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  // Fetch live results whenever query changes
  useEffect(() => {
    if (!query) return;

    setLoading(true);
    setError(null);
    setIsLive(false);
    setParsed(null);

    const apiUrl = cityHint
      ? `/api/search?q=${encodeURIComponent(query)}&city=${encodeURIComponent(cityHint)}`
      : `/api/search?q=${encodeURIComponent(query)}`;
    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        return res.json();
      })
      .then((data) => {
        // Store Claude's parsed intent
        if (data.parsed) setParsed(data.parsed);

        if (data.restaurants?.length > 0) {
          setRestaurants(data.restaurants);
          setIsLive(true);
        } else {
          // API succeeded but no results — show mock with note
          setRestaurants(mockRestaurants);
          setError("No live results found — showing sample data.");
        }
      })
      .catch((err) => {
        console.error("Search fetch error:", err);
        setRestaurants(mockRestaurants);
        setError("Could not load live results — showing sample data.");
      })
      .finally(() => setLoading(false));
  }, [query, cityHint]);

  const handleSearch = () => {
    if (!searchInput.trim()) return;
    const params = new URLSearchParams({ q: searchInput.trim() });
    if (cityHint) params.set("city", cityHint);
    router.push(`/search?${params.toString()}`);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const chips = parsed ? buildChips(parsed) : [];

  return (
    <div className="min-h-screen" style={{ background: "#FAF8F5" }}>
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20"
        style={{
          background: "rgba(250,248,245,0.95)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid #E8E4DF",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="font-serif flex-shrink-0 transition-opacity duration-150 hover:opacity-70"
            style={{
              fontSize: "26px",
              color: "#2D4A3E",
              fontWeight: 400,
              letterSpacing: "-0.01em",
              textDecoration: "none",
            }}
          >
            grove
          </Link>

          <div
            className="flex-1 flex items-center gap-2 transition-all duration-200"
            style={{
              background: "#FFFFFF",
              border: "1px solid #E8E4DF",
              borderRadius: "9999px",
              padding: "8px 8px 8px 16px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
            onFocusCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "#2D4A3E";
              el.style.boxShadow = "0 0 0 3px rgba(45,74,62,0.08)";
            }}
            onBlurCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "#E8E4DF";
              el.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
            }}
          >
            <svg
              className="flex-shrink-0"
              width="15" height="15"
              fill="none" stroke="#9B9590"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
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
                background: "#2D4A3E",
                color: "#FFFFFF",
                borderRadius: "9999px",
                padding: "7px 18px",
                fontSize: "13px",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#1E3329")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#2D4A3E")
              }
            >
              Search
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* AI interpretation strip */}
        <div
          className="inline-flex items-center gap-2 mb-4 px-4 py-3 rounded-xl"
          style={{ background: "#F5F8F6", border: "1px solid #DCE9E3" }}
        >
          {loading ? (
            <>
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: "#2D4A3E" }}
              />
              <span className="font-sans" style={{ fontSize: "13px", color: "#3D5248" }}>
                <span style={{ fontWeight: 500 }}>Thinking…</span>
                {" "}understanding your search &amp; querying Google Maps
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: "13px", color: "#2D4A3E" }}>✦</span>
              <span className="font-sans" style={{ fontSize: "13px", color: "#3D5248" }}>
                <span style={{ fontWeight: 500 }}>
                  {isLive ? "Grove understood:" : "Showing:"}
                </span>
                {" "}
                {parsed?.interpretation ?? `"${query}"`}
              </span>
            </>
          )}
        </div>

        {/* Intent chips — shown after results load */}
        {!loading && chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {chips.map((chip, i) => (
              <span
                key={i}
                className="text-xs font-sans font-medium px-3 py-1 rounded-full"
                style={CHIP_STYLES[chip.color]}
              >
                {chip.label}
              </span>
            ))}
          </div>
        )}

        {/* Error / fallback notice */}
        {error && !loading && (
          <div
            className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl"
            style={{
              background: "#FFF8EC",
              border: "1px solid #F5D9A0",
              display: "inline-flex",
            }}
          >
            <span style={{ fontSize: "13px", color: "#8B5C1A" }}>⚠</span>
            <span className="font-sans" style={{ fontSize: "12px", color: "#8B5C1A" }}>
              {error}
            </span>
          </div>
        )}

        {/* Results meta */}
        <div className="mb-5">
          <h2
            className="font-serif"
            style={{
              fontSize: "clamp(20px, 3vw, 26px)",
              color: "#1A1A1A",
              fontWeight: 400,
              letterSpacing: "-0.01em",
            }}
          >
            Results for{" "}
            <span style={{ color: "#2D4A3E" }}>&ldquo;{query}&rdquo;</span>
          </h2>
          <p className="font-sans mt-1" style={{ fontSize: "13px", color: "#9B9590" }}>
            {loading
              ? "Asking Claude, then fetching live data…"
              : `${restaurants.length} place${restaurants.length !== 1 ? "s" : ""} found · Sorted by relevance`}
          </p>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap mb-8">
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter;
            return (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className="font-sans font-medium transition-all duration-150"
                style={{
                  fontSize: "13px",
                  padding: "7px 16px",
                  borderRadius: "9999px",
                  border: isActive ? "1px solid #2D4A3E" : "1px solid #E8E4DF",
                  background: isActive ? "#2D4A3E" : "#FFFFFF",
                  color: isActive ? "#FFFFFF" : "#6B6561",
                  cursor: "pointer",
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

        {/* Results grid — skeletons while loading, real cards after */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : restaurants.map((r) => <ResultCard key={r.id} restaurant={r} />)}
        </div>

        <div className="h-16" />
      </main>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#FAF8F5" }}
        >
          <span
            className="font-serif"
            style={{ color: "#2D4A3E", fontSize: "24px", fontWeight: 400 }}
          >
            grove
          </span>
        </div>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
