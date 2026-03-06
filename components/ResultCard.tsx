"use client";

import { Restaurant, SourceType } from "@/lib/mockData";

// ─── Platform detection ───────────────────────────────────────────────────────

type Platform = "ios" | "android" | "desktop";

function getPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua))          return "android";
  return "desktop";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const PriceIndicator = ({ level }: { level: 1 | 2 | 3 }) => (
  <span className="font-sans text-sm tracking-wider">
    {[1, 2, 3].map((i) => (
      <span key={i} style={{ color: i <= level ? "#2D4A3E" : "#D4D0CB", fontWeight: i <= level ? "600" : "400" }}>$</span>
    ))}
  </span>
);

const TAG_STYLES: Record<string, React.CSSProperties> = {
  Halal:           { background: "#EDFBF3", color: "#1A6B40",  border: "1px solid #B6EDD0" },
  Vegetarian:      { background: "#F5FBE8", color: "#4A7C1F",  border: "1px solid #CEEBAA" },
  Vegan:           { background: "#F5FBE8", color: "#4A7C1F",  border: "1px solid #CEEBAA" },
  "No Pork":       { background: "#FFF8EC", color: "#8B5C1A",  border: "1px solid #F5D9A0" },
  "Hawker Centre": { background: "#FFF3E0", color: "#E65100",  border: "1px solid #FFB74D" },
  "Reddit Gem":    { background: "#FFF1F2", color: "#BE123C",  border: "1px solid #FECDD3" },
};

const TagBadge = ({ tag }: { tag: string }) => (
  <span
    className="text-xs font-sans font-medium px-2.5 py-1 rounded-full"
    style={TAG_STYLES[tag] ?? { background: "#F0EDE8", color: "#5C5852", border: "1px solid #E0DCD6" }}
  >
    {tag}
  </span>
);

const SOURCE_META: Record<SourceType, { label: string; icon: string; bg: string; color: string; border: string }> = {
  google: { label: "Google Maps", icon: "🗺️", bg: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" },
  reddit: { label: "Reddit",      icon: "🔴", bg: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" },
  nea:    { label: "NEA Official",icon: "🏛️", bg: "#FFF3E0", color: "#E65100", border: "1px solid #FFB74D" },
  blog:   { label: "Food Blog",   icon: "📖", bg: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE" },
};

const SourceBadge = ({ source, extra }: { source: SourceType; extra?: string }) => {
  const meta  = SOURCE_META[source];
  const label = extra ?? `${meta.icon} ${meta.label}`;
  return (
    <span
      className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full"
      style={{ background: meta.bg, color: meta.color, border: meta.border, letterSpacing: "0.02em" }}
      title={`Source: ${meta.label}`}
    >
      {label}
    </span>
  );
};

const LocalsBadge = () => (
  <span
    className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full"
    style={{ background: "#EDFBF3", color: "#1A6B40", border: "1px solid #B6EDD0", letterSpacing: "0.02em" }}
  >
    ✓ Mentioned by locals
  </span>
);

// ─── Action button ────────────────────────────────────────────────────────────

interface ActionBtnProps {
  label:    string;
  href?:    string;
  onClick?: () => void;
  disabled?: boolean;
}

const ActionBtn = ({ label, href, onClick, disabled }: ActionBtnProps) => {
  const style: React.CSSProperties = {
    background:     disabled ? "#F5F5F5" : "#EBF1ED",
    color:          disabled ? "#BABABA" : "#2D4A3E",
    borderRadius:   "9999px",
    padding:        "8px 0",
    fontSize:       "12px",
    fontWeight:     500,
    letterSpacing:  "0.02em",
    textAlign:      "center",
    cursor:         disabled ? "default" : "pointer",
    border:         "none",
    textDecoration: "none",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    flex:           1,
    transition:     "background 0.15s",
    WebkitTapHighlightColor: "transparent",
    minHeight:      "36px",
  };
  const enter = (e: React.MouseEvent<HTMLElement>) => {
    if (!disabled) (e.currentTarget as HTMLElement).style.background = "#D5E6DB";
  };
  const leave = (e: React.MouseEvent<HTMLElement>) => {
    if (!disabled) (e.currentTarget as HTMLElement).style.background = "#EBF1ED";
  };

  if (href && !disabled) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="font-sans" style={style} onMouseEnter={enter} onMouseLeave={leave}>
        {label}
      </a>
    );
  }
  return (
    <button onClick={disabled ? undefined : onClick}
      className="font-sans" style={style} disabled={disabled}
      onMouseEnter={enter} onMouseLeave={leave}>
      {label}
    </button>
  );
};

// ─── TikTok deep link handler ─────────────────────────────────────────────────

function openTikTok(name: string, city: string) {
  const keyword = encodeURIComponent(`${name} ${city}`);
  const webUrl  = `https://www.tiktok.com/search?q=${keyword}`;
  const platform = getPlatform();

  if (typeof window === "undefined") return;

  if (platform === "ios") {
    // Try app URL scheme; fall back to web after 500ms if app not installed
    window.location.href = `snssdk1233://search?keyword=${keyword}`;
    setTimeout(() => { window.open(webUrl, "_blank"); }, 500);
  } else if (platform === "android") {
    // Android intent URL
    window.location.href =
      `intent://search?keyword=${keyword}#Intent;package=com.zhiliaoapp.musically;scheme=snssdk1233;end`;
    setTimeout(() => { window.open(webUrl, "_blank"); }, 500);
  } else {
    window.open(webUrl, "_blank");
  }
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface ResultCardProps {
  restaurant: Restaurant & {
    websiteUri?:      string;
    reservable?:      boolean;
    dineIn?:          boolean;
    userRatingCount?: number;
  };
  city?: string;
}

export default function ResultCard({ restaurant, city = "Singapore" }: ResultCardProps) {
  const {
    name, location, cuisine, priceRange,
    isOpen, closingTime, tags, distance,
    matchReason, phone, rating, placeId,
    sources = ["google"], blogSources, redditMentions,
    isRedditGem, isHawkerCentre, sourceUrl,
    websiteUri, reservable, dineIn, userRatingCount,
  } = restaurant;

  // ── URL building ─────────────────────────────────────────────────────────────

  // Maps — universal URL that opens the Maps app on mobile, browser on desktop
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(`${name} ${location}`)}`;

  // Reviews — Google search shows ratings from all sources
  const reviewsUrl = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} reviews`)}`;

  // Booking — smart logic
  const isHawkerOrBudget = isHawkerCentre || priceRange === 1;

  // Check if website has a known booking platform
  const BOOKING_PLATFORMS = ["chope", "sevenrooms", "tableapp", "eatigo", "quandoo", "resy", "opentable"];
  const hasBookingUrl = websiteUri && BOOKING_PLATFORMS.some((p) => websiteUri.toLowerCase().includes(p));

  let bookingLabel = "Menu";
  let bookingUrl: string;

  if (isHawkerOrBudget) {
    // Budget / hawker → show menu search
    bookingLabel = "Menu";
    bookingUrl   = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} menu`)}`;
  } else if (hasBookingUrl) {
    // Has direct booking platform URL
    bookingLabel = "Book";
    bookingUrl   = websiteUri!;
  } else if (reservable || dineIn || (userRatingCount && userRatingCount > 50)) {
    // Likely bookable — use Google search
    bookingLabel = "Book";
    bookingUrl   = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} reserve table`)}`;
  } else {
    // Default — menu search
    bookingLabel = "Menu";
    bookingUrl   = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} menu`)}`;
  }

  // Share — just the Google Maps URL
  const handleShare = async () => {
    const shareText = `Check out ${name} — ${mapsUrl}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: name, text: shareText, url: mapsUrl });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
      }
    } catch { /* cancelled */ }
  };

  // ── Action rows ──────────────────────────────────────────────────────────────

  const topRow: ActionBtnProps[] = [
    { label: "Maps",        href: mapsUrl },
    { label: bookingLabel,  href: bookingUrl },
    { label: "TikTok",      onClick: () => openTikTok(name, city) },
  ];
  const bottomRow: ActionBtnProps[] = [
    phone ? { label: "Call", href: `tel:${phone}` } : { label: "Call", disabled: true },
    { label: "Share",   onClick: handleShare },
    { label: "Reviews", href: reviewsUrl },
  ];

  // ── Card accent ──────────────────────────────────────────────────────────────

  const cardBg      = isRedditGem ? "#FFFBFB" : isHawkerCentre ? "#FFFDF5" : "#FFFFFF";
  const hasReddit   = sources.includes("reddit");
  const hasBlog     = sources.includes("blog");
  const hasGoogle   = sources.includes("google");
  const locallyMentioned = (hasReddit || hasBlog) && hasGoogle;

  return (
    <article
      className="flex flex-col rounded-2xl border transition-all duration-200"
      style={{
        background:  cardBg,
        borderColor: isRedditGem ? "#FECDD3" : isHawkerCentre ? "#FFB74D" : "#E8E4DF",
        padding:     "20px",
        boxShadow:   "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(45,74,62,0.08)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-xl leading-tight mb-0.5 truncate" style={{ color: "#1A1A1A", fontWeight: 500 }}>
            {name}
          </h3>
          <p className="text-xs font-sans truncate" style={{ color: "#9B9590" }}>
            {location} &nbsp;·&nbsp; {cuisine}
          </p>
        </div>
        <div className="flex-shrink-0 pt-0.5">
          <PriceIndicator level={priceRange} />
        </div>
      </div>

      {/* Status + Distance + Rating */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: isOpen ? "#2D9C64" : "#C0392B" }} />
          <span className="text-xs font-sans font-medium"
            style={{ color: isOpen ? "#1A6B40" : "#922B21" }}>
            {isOpen ? `Open · Closes ${closingTime}` : `Closed · Was ${closingTime}`}
          </span>
        </div>
        {!isRedditGem && distance && distance !== "—" && (
          <>
            <span style={{ color: "#D4D0CB", fontSize: "10px" }}>|</span>
            <span className="text-xs font-sans" style={{ color: "#6B6561" }}>📍 {distance}</span>
          </>
        )}
        {rating !== undefined && (
          <>
            <span style={{ color: "#D4D0CB", fontSize: "10px" }}>|</span>
            <span className="text-xs font-sans font-medium" style={{ color: "#2D4A3E" }}>★ {rating.toFixed(1)}</span>
          </>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
        </div>
      )}

      {/* Source attribution */}
      {(sources.length > 0 || locallyMentioned) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {locallyMentioned && <LocalsBadge />}
          {sources.map((s) => {
            if (s === "blog" && blogSources?.length) {
              return blogSources.slice(0, 2).map((bs) => (
                <SourceBadge key={`blog-${bs}`} source="blog" extra={`📖 ${bs}`} />
              ));
            }
            if (s === "reddit") {
              return (
                <SourceBadge key="reddit" source="reddit"
                  extra={isRedditGem ? "🔴 Reddit gem" : redditMentions && redditMentions > 1 ? `🔴 Reddit ×${redditMentions}` : undefined} />
              );
            }
            if (s === "nea") return <SourceBadge key="nea" source="nea" />;
            return null;
          })}
          {isRedditGem && sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] font-sans font-semibold underline"
              style={{ color: "#BE123C", alignSelf: "center" }}>
              View thread ↗
            </a>
          )}
        </div>
      )}

      {/* Match reason */}
      <div
        className="rounded-xl p-3 mb-4 flex-1"
        style={{
          background: isRedditGem ? "#FFF5F7" : isHawkerCentre ? "#FFF9F0" : "#F5F8F6",
          border: `1px solid ${isRedditGem ? "#FECDD3" : isHawkerCentre ? "#FFD580" : "#DCE9E3"}`,
        }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs" style={{ color: isRedditGem ? "#BE123C" : "#2D4A3E" }}>
            {isRedditGem ? "🔴" : isHawkerCentre ? "🏛️" : "✦"}
          </span>
          <span className="text-[10px] font-sans font-semibold tracking-widest uppercase"
            style={{ color: isRedditGem ? "#BE123C" : "#2D4A3E" }}>
            {isRedditGem ? "Why locals love it" : isHawkerCentre ? "About this hawker centre" : "Matches because"}
          </span>
        </div>
        <p className="text-xs font-sans leading-relaxed" style={{ color: "#3D5248" }}>
          {matchReason}
        </p>
      </div>

      {/* Action buttons — 2 rows of 3 */}
      {!isRedditGem && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            {topRow.map((btn) => <ActionBtn key={btn.label} {...btn} />)}
          </div>
          <div className="flex gap-1.5">
            {bottomRow.map((btn) => <ActionBtn key={btn.label} {...btn} />)}
          </div>
        </div>
      )}

      {/* Reddit gem CTAs */}
      {isRedditGem && (
        <div className="flex gap-1.5">
          <ActionBtn label="Find on Maps" href={mapsUrl} />
          <ActionBtn label="TikTok" onClick={() => openTikTok(name, city)} />
          {sourceUrl && <ActionBtn label="Reddit thread" href={sourceUrl} />}
        </div>
      )}
    </article>
  );
}
