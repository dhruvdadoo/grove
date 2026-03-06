"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DetectedLocation {
  city:    string;
  country: string;
  label:   string;
  lat:     number;
  lng:     number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Query chips ─────────────────────────────────────────────────────────────

const MODE_CHIPS = ["Hidden Gems", "Late Night", "Cheap Eats", "Date Night", "Hawker", "Highly Rated"] as const;

const OCCASION_CHIPS = [
  "First Date", "Family Dinner", "Post-Gym", "Solo Lunch",
  "Group of 10+", "Business Lunch", "Celebrating", "Hangover Food",
] as const;

function getModeQuery(mode: string, hour: number): string {
  switch (mode) {
    case "Hidden Gems":  return "hidden gem restaurants near me";
    case "Late Night":   return hour >= 21 ? "open now late night supper near me" : "late night supper spots near me";
    case "Cheap Eats":   return "best cheap eats under $10 near me";
    case "Date Night":   return "romantic restaurant for date night near me";
    case "Hawker":       return "hawker centre near me";
    case "Highly Rated": return "best highly rated restaurants near me";
    default:             return `${mode.toLowerCase()} near me`;
  }
}

function getOccasionQuery(occasion: string): string {
  switch (occasion) {
    case "First Date":     return "romantic restaurant first date near me not too expensive";
    case "Family Dinner":  return "family friendly restaurant for dinner near me";
    case "Post-Gym":       return "healthy high protein meal near me open now";
    case "Solo Lunch":     return "good solo lunch spots near me";
    case "Group of 10+":   return "restaurant for large group dining near me";
    case "Business Lunch": return "smart casual business lunch restaurant near me";
    case "Celebrating":    return "special occasion celebration restaurant near me";
    case "Hangover Food":  return "comfort food near me open now";
    default:               return `${occasion.toLowerCase()} near me`;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [query,     setQuery]     = useState("");
  const [location,  setLocation]  = useState<DetectedLocation | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "detecting" | "done" | "denied">("idle");
  const [hour,      setHour]      = useState(12);
  const router = useRouter();

  // Get current hour for time-aware queries
  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  // Request GPS on mount
  useEffect(() => {
    const cached = localStorage.getItem("grove_location");
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as DetectedLocation;
        if (parsed.lat && parsed.lng) {
          setLocation(parsed);
          setLocStatus("done");
          return;
        }
      } catch { /* ignore */ }
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleChip = (q: string) => {
    router.push(buildSearchUrl(q));
  };

  // Shared chip base styles
  const modeChipStyle = (hovered: boolean): React.CSSProperties => ({
    fontSize:     "13px",
    color:        hovered ? "#2D4A3E" : "#3D5248",
    background:   "transparent",
    border:       `1px solid ${hovered ? "#2D4A3E" : "#8FAB9E"}`,
    borderRadius: "9999px",
    padding:      "6px 16px",
    cursor:       "pointer",
    transition:   "all 0.15s",
    fontWeight:   hovered ? 500 : 400,
  });

  const occasionChipStyle = (hovered: boolean): React.CSSProperties => ({
    fontSize:     "13px",
    color:        hovered ? "#5C4A3E" : "#6B6561",
    background:   "transparent",
    border:       `1px solid ${hovered ? "#8B6B5C" : "#C4B8B0"}`,
    borderRadius: "9999px",
    padding:      "6px 16px",
    cursor:       "pointer",
    transition:   "all 0.15s",
    fontWeight:   hovered ? 500 : 400,
  });

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
      <div className="w-full max-w-2xl mb-5 px-1">
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
            el.style.boxShadow   = "0 0 0 3px rgba(45,74,62,0.1), 0 1px 4px rgba(0,0,0,0.05)";
            el.style.borderColor = "#2D4A3E";
          }}
          onBlurCapture={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.boxShadow   = "0 1px 4px rgba(0,0,0,0.05)";
            el.style.borderColor = "#E8E4DF";
          }}
        >
          <svg className="flex-shrink-0" width="17" height="17"
            fill="none" stroke="#9B9590" strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
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
              background:    "#2D4A3E",
              color:         "#FFFFFF",
              borderRadius:  "9999px",
              padding:       "9px 22px",
              fontSize:      "14px",
              letterSpacing: "0.01em",
              border:        "none",
              cursor:        "pointer",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#1E3329")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#2D4A3E")}
          >
            Search
          </button>
        </div>

        {/* Location indicator */}
        <div className="flex justify-center mt-3 h-5">
          {locStatus === "detecting" && (
            <span className="font-sans text-xs flex items-center gap-1.5" style={{ color: "#9B9590" }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#9B9590" }} />
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

      {/* Query mode chips */}
      <div className="w-full max-w-2xl px-1 mb-3">
        <div className="flex flex-wrap gap-2 justify-center">
          {MODE_CHIPS.map((chip) => (
            <HoverChip
              key={chip}
              label={chip}
              getStyle={modeChipStyle}
              onClick={() => handleChip(getModeQuery(chip, hour))}
            />
          ))}
        </div>
      </div>

      {/* Occasion chips */}
      <div className="w-full max-w-2xl px-1 mb-12">
        <div className="flex flex-wrap gap-2 justify-center">
          {OCCASION_CHIPS.map((chip) => (
            <HoverChip
              key={chip}
              label={chip}
              getStyle={occasionChipStyle}
              onClick={() => handleChip(getOccasionQuery(chip))}
            />
          ))}
        </div>
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

// ─── HoverChip helper ─────────────────────────────────────────────────────────

function HoverChip({
  label,
  getStyle,
  onClick,
}: {
  label: string;
  getStyle: (hovered: boolean) => React.CSSProperties;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      className="font-sans"
      style={getStyle(hovered)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
