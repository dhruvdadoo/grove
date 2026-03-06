"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetectedLocation {
  city:    string;   // e.g. "Singapore"
  country: string;   // e.g. "SG"
  label:   string;   // display string
  lat:     number;   // exact GPS latitude
  lng:     number;   // exact GPS longitude
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Reverse-geocode a lat/lng via BigDataCloud (free, no key required) */
async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; country: string; label: string } | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
    );
    if (!res.ok) return null;
    const d = await res.json();
    return {
      city:    d.city || d.locality || d.principalSubdivision || "Nearby",
      country: d.countryCode ?? "",
      label:   d.city || d.locality || d.countryName || "Nearby",
    };
  } catch {
    return null;
  }
}

const EXAMPLE_QUERIES = [
  "Halal late night supper",
  "Under $10 near me",
  "Vegetarian lunch spots",
  "Open now family dinner",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [query,    setQuery]    = useState("");
  const [location, setLocation] = useState<DetectedLocation | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "detecting" | "done" | "denied">("idle");
  const router = useRouter();

  // Request GPS immediately on mount — store lat/lng with city
  useEffect(() => {
    // Check localStorage first (avoid re-requesting on every load)
    const cached = localStorage.getItem("grove_location");
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as DetectedLocation;
        // Only use cache if it has real GPS coords
        if (parsed.lat && parsed.lng) {
          setLocation(parsed);
          setLocStatus("done");
          return;
        }
      } catch { /* ignore corrupt cache */ }
    }

    if (!navigator.geolocation) {
      setLocStatus("denied");
      return;
    }

    setLocStatus("detecting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const geo = await reverseGeocode(latitude, longitude);
        const loc: DetectedLocation = {
          city:    geo?.city    ?? "Nearby",
          country: geo?.country ?? "",
          label:   geo?.label   ?? "Nearby",
          lat:     latitude,
          lng:     longitude,
        };
        setLocation(loc);
        setLocStatus("done");
        localStorage.setItem("grove_location", JSON.stringify(loc));
      },
      () => setLocStatus("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300_000 }
    );
  }, []);

  // Build search URL — always includes lat/lng if available
  function buildSearchUrl(q: string): string {
    const params = new URLSearchParams({ q: q.trim() });
    if (location) {
      params.set("city", location.city);
      params.set("lat",  location.lat.toString());
      params.set("lng",  location.lng.toString());
    }
    return `/search?${params.toString()}`;
  }

  const handleSearch = () => {
    if (!query.trim()) return;
    router.push(buildSearchUrl(query));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleExample = (q: string) => {
    router.push(buildSearchUrl(q));
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16 relative"
      style={{ background: "#FAF8F5" }}
    >
      {/* Wordmark */}
      <div className="text-center mb-14">
        <h1
          className="font-serif tracking-tight select-none"
          style={{
            fontSize: "clamp(56px, 10vw, 88px)",
            color: "#2D4A3E",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          grove
        </h1>
        <div
          className="mx-auto mt-3"
          style={{ width: "32px", height: "1px", background: "#2D4A3E", opacity: 0.35 }}
        />
      </div>

      {/* Headline */}
      <div className="text-center mb-10 max-w-lg px-2">
        <h2
          className="font-serif mb-3"
          style={{
            fontSize: "clamp(28px, 5vw, 42px)",
            color: "#1A1A1A",
            fontWeight: 400,
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
          }}
        >
          Find exactly where to eat
        </h2>
        <p className="font-sans" style={{ fontSize: "15px", color: "#9B9590", letterSpacing: "0.01em" }}>
          Halal, late night, under&nbsp;$10, near you — just ask
        </p>
      </div>

      {/* Search bar */}
      <div className="w-full max-w-2xl mb-6 px-1">
        <div
          className="flex items-center gap-3 transition-all duration-200"
          style={{
            background:   "#FFFFFF",
            border:       "1px solid #E8E4DF",
            borderRadius: "9999px",
            padding:      "10px 10px 10px 22px",
            boxShadow:    "0 1px 4px rgba(0,0,0,0.05)",
          }}
          onFocusCapture={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.boxShadow  = "0 0 0 3px rgba(45,74,62,0.1), 0 1px 4px rgba(0,0,0,0.05)";
            el.style.borderColor = "#2D4A3E";
          }}
          onBlurCapture={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.boxShadow  = "0 1px 4px rgba(0,0,0,0.05)";
            el.style.borderColor = "#E8E4DF";
          }}
        >
          <svg
            className="flex-shrink-0"
            width="17" height="17"
            fill="none" stroke="#9B9590"
            strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="What are you craving?"
            className="flex-1 bg-transparent outline-none font-sans"
            style={{ fontSize: "15px", color: "#1A1A1A", caretColor: "#2D4A3E" }}
          />
          <button
            onClick={handleSearch}
            className="flex-shrink-0 font-sans font-medium transition-colors duration-150"
            style={{
              background:   "#2D4A3E",
              color:        "#FFFFFF",
              borderRadius: "9999px",
              padding:      "9px 22px",
              fontSize:     "14px",
              letterSpacing:"0.01em",
              border:       "none",
              cursor:       "pointer",
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

        {/* Location indicator */}
        <div className="flex justify-center mt-3 h-5">
          {locStatus === "detecting" && (
            <span className="font-sans text-xs flex items-center gap-1.5" style={{ color: "#9B9590" }}>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "#9B9590" }}
              />
              Detecting your location…
            </span>
          )}
          {locStatus === "done" && location && (
            <span className="font-sans text-xs flex items-center gap-1" style={{ color: "#2D4A3E" }}>
              📍 {location.label}
              <button
                className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                style={{ fontSize: "10px", background: "none", border: "none", cursor: "pointer", color: "#2D4A3E" }}
                onClick={() => {
                  localStorage.removeItem("grove_location");
                  setLocation(null);
                  setLocStatus("idle");
                }}
                title="Clear location"
              >
                ✕
              </button>
            </span>
          )}
          {locStatus === "denied" && (
            <span className="font-sans text-xs" style={{ color: "#9B9590" }}>
              Location access denied — enable it for nearby results
            </span>
          )}
        </div>
      </div>

      {/* Example queries */}
      <div className="flex flex-wrap gap-2 justify-center max-w-md px-2 mb-16">
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            onClick={() => handleExample(q)}
            className="font-sans transition-all duration-150"
            style={{
              fontSize:     "13px",
              color:        "#6B6561",
              background:   "#F0EDE8",
              border:       "1px solid #E8E4DF",
              borderRadius: "9999px",
              padding:      "7px 16px",
              cursor:       "pointer",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background  = "#E8E4DF";
              el.style.color       = "#2D4A3E";
              el.style.borderColor = "#2D4A3E";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background  = "#F0EDE8";
              el.style.color       = "#6B6561";
              el.style.borderColor = "#E8E4DF";
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Footer */}
      <p
        className="font-sans absolute bottom-8"
        style={{
          fontSize:      "11px",
          color:         "#C4C0BB",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        Powered by AI &nbsp;·&nbsp;{" "}
        {locStatus === "done" && location ? location.label : "Singapore"}
      </p>
    </main>
  );
}
