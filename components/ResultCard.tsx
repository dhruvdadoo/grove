"use client";

import { Restaurant, SourceType } from "@/lib/mockData";

// ─── Sub-components ───────────────────────────────────────────────────────────

const PriceIndicator = ({ level }: { level: 1 | 2 | 3 }) => (
  <span className="font-sans text-sm tracking-wider">
    {[1, 2, 3].map((i) => (
      <span
        key={i}
        style={{
          color:      i <= level ? "#2D4A3E" : "#D4D0CB",
          fontWeight: i <= level ? "600" : "400",
        }}
      >
        $
      </span>
    ))}
  </span>
);

// ── Tag badge — dietary + special tags ────────────────────────────────────────

const TAG_STYLES: Record<string, React.CSSProperties> = {
  Halal:          { background: "#EDFBF3", color: "#1A6B40",  border: "1px solid #B6EDD0" },
  Vegetarian:     { background: "#F5FBE8", color: "#4A7C1F",  border: "1px solid #CEEBAA" },
  Vegan:          { background: "#F5FBE8", color: "#4A7C1F",  border: "1px solid #CEEBAA" },
  "No Pork":      { background: "#FFF8EC", color: "#8B5C1A",  border: "1px solid #F5D9A0" },
  "Hawker Centre":{ background: "#FFF3E0", color: "#E65100",  border: "1px solid #FFB74D" },
  "Reddit Gem":   { background: "#FFF1F2", color: "#BE123C",  border: "1px solid #FECDD3" },
};

const TagBadge = ({ tag }: { tag: string }) => {
  const style = TAG_STYLES[tag] ?? {
    background: "#F0EDE8",
    color:      "#5C5852",
    border:     "1px solid #E0DCD6",
  };
  return (
    <span
      className="text-xs font-sans font-medium px-2.5 py-1 rounded-full"
      style={style}
    >
      {tag}
    </span>
  );
};

// ── Source badge — data origin indicators ─────────────────────────────────────

interface SourceBadgeProps {
  source: SourceType;
  extra?: string;
  count?: number;
}

const SOURCE_META: Record<
  SourceType,
  { label: string; icon: string; bg: string; color: string; border: string }
> = {
  google: {
    label:  "Google Maps",
    icon:   "🗺️",
    bg:     "#EFF6FF",
    color:  "#1D4ED8",
    border: "1px solid #BFDBFE",
  },
  reddit: {
    label:  "Reddit",
    icon:   "🔴",
    bg:     "#FFF1F2",
    color:  "#BE123C",
    border: "1px solid #FECDD3",
  },
  nea: {
    label:  "NEA Official",
    icon:   "🏛️",
    bg:     "#FFF3E0",
    color:  "#E65100",
    border: "1px solid #FFB74D",
  },
  blog: {
    label:  "Food Blog",
    icon:   "📖",
    bg:     "#F5F3FF",
    color:  "#6D28D9",
    border: "1px solid #DDD6FE",
  },
};

const SourceBadge = ({ source, extra, count }: SourceBadgeProps) => {
  const meta = SOURCE_META[source];
  const label =
    extra      ? `${meta.icon} ${extra}` :
    count && count > 1 ? `${meta.icon} ${meta.label} ×${count}` :
    `${meta.icon} ${meta.label}`;

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

// ── Locals boost badge ────────────────────────────────────────────────────────

const LocalsBadge = () => (
  <span
    className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full"
    style={{
      background: "#EDFBF3",
      color:      "#1A6B40",
      border:     "1px solid #B6EDD0",
      letterSpacing: "0.02em",
    }}
  >
    ✓ Mentioned by locals
  </span>
);

// ── Action button ─────────────────────────────────────────────────────────────

interface ActionBtnProps {
  label:    string;
  href?:    string;
  onClick?: () => void;
  disabled?: boolean;
}

const ActionBtn = ({ label, href, onClick, disabled }: ActionBtnProps) => {
  const baseStyle: React.CSSProperties = {
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
  };

  const enter = (e: React.MouseEvent<HTMLElement>) => {
    if (!disabled) (e.currentTarget as HTMLElement).style.background = "#D5E6DB";
  };
  const leave = (e: React.MouseEvent<HTMLElement>) => {
    if (!disabled) (e.currentTarget as HTMLElement).style.background = "#EBF1ED";
  };

  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-sans"
        style={baseStyle}
        onMouseEnter={enter}
        onMouseLeave={leave}
      >
        {label}
      </a>
    );
  }
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className="font-sans"
      style={baseStyle}
      onMouseEnter={enter}
      onMouseLeave={leave}
      disabled={disabled}
    >
      {label}
    </button>
  );
};

// ─── Main card ────────────────────────────────────────────────────────────────

interface ResultCardProps {
  restaurant: Restaurant;
  city?: string; // detected city from geolocation (e.g. "Singapore", "New York")
}

export default function ResultCard({ restaurant, city = "Singapore" }: ResultCardProps) {
  const {
    name, location, cuisine, priceRange,
    isOpen, closingTime, tags, distance,
    matchReason, phone, rating, placeId,
    sources = ["google"], blogSources, redditMentions,
    isRedditGem, isHawkerCentre, sourceUrl,
  } = restaurant;

  // ── URL building ─────────────────────────────────────────────────────────────

  // Maps search URL — uses actual address, no hardcoded city
  const mapsSearchQ   = encodeURIComponent(`${name} ${location}`);
  const mapsSearchUrl = `https://www.google.com/maps/search/?q=${mapsSearchQ}`;

  // Maps button deep-links to place_id if available, otherwise search
  const mapsUrl = placeId
    ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
    : mapsSearchUrl;

  // Reviews — always use search URL so it opens the right reviews panel
  const reviewsUrl = `https://www.google.com/maps/search/?q=${encodeURIComponent(`${name} ${location} reviews`)}`;

  // Booking — Chope for Singapore, Google search for everywhere else
  const isSingapore = !city || /singapore|sg\b/i.test(city);
  const bookingUrl  = isSingapore
    ? `https://www.chope.co/singapore-restaurants/search?q=${encodeURIComponent(name)}`
    : `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} reservation booking`)}`;

  // TikTok — uses detected city, not hardcoded Singapore
  const tiktokUrl = `https://www.tiktok.com/search?q=${encodeURIComponent(`${name} ${city}`)}`;

  // Share — just the Google Maps URL so recipient can open it directly
  const handleShare = async () => {
    const shareText = `Check out ${name} — ${mapsSearchUrl}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: name, text: shareText, url: mapsSearchUrl });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
      }
    } catch { /* cancelled / unsupported */ }
  };

  // ── Action rows ──────────────────────────────────────────────────────────────

  const topRow: ActionBtnProps[] = [
    { label: "Maps",    href: mapsUrl },
    { label: "Booking", href: bookingUrl },
    { label: "TikTok",  href: tiktokUrl },
  ];
  const bottomRow: ActionBtnProps[] = [
    phone
      ? { label: "Call",    href: `tel:${phone}` }
      : { label: "Call",    disabled: true },
    { label: "Share",   onClick: handleShare },
    { label: "Reviews", href: reviewsUrl },
  ];

  // ── Card accent ──────────────────────────────────────────────────────────────

  const cardBg = isRedditGem
    ? "#FFFBFB"
    : isHawkerCentre
    ? "#FFFDF5"
    : "#FFFFFF";

  const hasReddit = sources.includes("reddit");
  const hasBlog   = sources.includes("blog");
  const hasGoogle = sources.includes("google");
  const mentionedByLocals = (hasReddit || hasBlog) && hasGoogle;

  return (
    <article
      className="flex flex-col rounded-2xl border transition-all duration-200"
      style={{
        background:   cardBg,
        borderColor:  isRedditGem ? "#FECDD3" : isHawkerCentre ? "#FFB74D" : "#E8E4DF",
        padding:      "20px",
        boxShadow:    "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.boxShadow =
          "0 4px 16px rgba(45,74,62,0.08)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.boxShadow =
          "0 1px 3px rgba(0,0,0,0.04)")
      }
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className="font-serif text-xl leading-tight mb-0.5 truncate"
            style={{ color: "#1A1A1A", fontWeight: 500 }}
          >
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
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: isOpen ? "#2D9C64" : "#C0392B" }}
          />
          <span
            className="text-xs font-sans font-medium"
            style={{ color: isOpen ? "#1A6B40" : "#922B21" }}
          >
            {isOpen
              ? `Open · Closes ${closingTime}`
              : `Closed · Was ${closingTime}`}
          </span>
        </div>
        {!isRedditGem && (
          <>
            <span style={{ color: "#D4D0CB", fontSize: "10px" }}>|</span>
            <span className="text-xs font-sans" style={{ color: "#6B6561" }}>
              📍 {distance}
            </span>
          </>
        )}
        {rating !== undefined && (
          <>
            <span style={{ color: "#D4D0CB", fontSize: "10px" }}>|</span>
            <span className="text-xs font-sans font-medium" style={{ color: "#2D4A3E" }}>
              ★ {rating.toFixed(1)}
            </span>
          </>
        )}
      </div>

      {/* Dietary + special tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
      )}

      {/* Source attribution row */}
      {(sources.length > 0 || mentionedByLocals) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {mentionedByLocals && <LocalsBadge />}
          {sources.map((s) => {
            if (s === "blog" && blogSources?.length) {
              return blogSources.slice(0, 2).map((bs) => (
                <SourceBadge key={`blog-${bs}`} source="blog" extra={`📖 ${bs}`} />
              ));
            }
            if (s === "reddit") {
              return (
                <SourceBadge
                  key="reddit"
                  source="reddit"
                  extra={
                    isRedditGem
                      ? "🔴 Reddit gem"
                      : redditMentions && redditMentions > 1
                      ? `🔴 Reddit ×${redditMentions}`
                      : undefined
                  }
                />
              );
            }
            if (s === "nea") {
              return <SourceBadge key="nea" source="nea" />;
            }
            return null;
          })}
          {isRedditGem && sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-sans font-semibold underline"
              style={{ color: "#BE123C", alignSelf: "center" }}
            >
              View thread ↗
            </a>
          )}
        </div>
      )}

      {/* Match reason */}
      <div
        className="rounded-xl p-3 mb-4 flex-1"
        style={{
          background: isRedditGem
            ? "#FFF5F7"
            : isHawkerCentre
            ? "#FFF9F0"
            : "#F5F8F6",
          border: `1px solid ${isRedditGem ? "#FECDD3" : isHawkerCentre ? "#FFD580" : "#DCE9E3"}`,
        }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs" style={{ color: isRedditGem ? "#BE123C" : "#2D4A3E" }}>
            {isRedditGem ? "🔴" : isHawkerCentre ? "🏛️" : "✦"}
          </span>
          <span
            className="text-[10px] font-sans font-semibold tracking-widest uppercase"
            style={{ color: isRedditGem ? "#BE123C" : "#2D4A3E" }}
          >
            {isRedditGem
              ? "Why locals love it"
              : isHawkerCentre
              ? "About this hawker centre"
              : "Matches because"}
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
            {topRow.map((btn) => (
              <ActionBtn key={btn.label} {...btn} />
            ))}
          </div>
          <div className="flex gap-1.5">
            {bottomRow.map((btn) => (
              <ActionBtn key={btn.label} {...btn} />
            ))}
          </div>
        </div>
      )}

      {/* Reddit gems get simplified CTAs */}
      {isRedditGem && (
        <div className="flex gap-1.5">
          <ActionBtn label="Find on Maps" href={mapsSearchUrl} />
          <ActionBtn label="TikTok" href={tiktokUrl} />
          {sourceUrl && (
            <ActionBtn label="Reddit thread" href={sourceUrl} />
          )}
        </div>
      )}
    </article>
  );
}
