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
}

const ActionBtn = ({ label, href, onClick }: ActionBtnProps) => {
  const baseStyle: React.CSSProperties = {
    background:     "#EBF1ED",
    color:          "#2D4A3E",
    borderRadius:   "9999px",
    padding:        "8px 0",
    fontSize:       "12px",
    fontWeight:     500,
    letterSpacing:  "0.02em",
    textAlign:      "center",
    cursor:         "pointer",
    border:         "none",
    textDecoration: "none",
    display:        "flex",
    alignItems:     "center",
    justifyContent: "center",
    flex:           1,
    transition:     "background 0.15s",
  };

  const enter = (e: React.MouseEvent<HTMLElement>) =>
    ((e.currentTarget as HTMLElement).style.background = "#D5E6DB");
  const leave = (e: React.MouseEvent<HTMLElement>) =>
    ((e.currentTarget as HTMLElement).style.background = "#EBF1ED");

  if (href) {
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
      onClick={onClick}
      className="font-sans"
      style={baseStyle}
      onMouseEnter={enter}
      onMouseLeave={leave}
    >
      {label}
    </button>
  );
};

// ─── Main card ────────────────────────────────────────────────────────────────

export default function ResultCard({ restaurant }: { restaurant: Restaurant }) {
  const {
    name, location, cuisine, priceRange,
    isOpen, closingTime, tags, distance,
    matchReason, phone, rating, placeId,
    sources = ["google"], blogSources, redditMentions,
    isRedditGem, isHawkerCentre, sourceUrl,
  } = restaurant;

  const slug     = encodeURIComponent(`${name} ${location}`);
  const nameSlug = encodeURIComponent(name);

  const mapsUrl    = placeId
    ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${slug}`;
  const reviewsUrl = placeId
    ? `https://search.google.com/local/reviews?placeid=${placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${slug}`;

  const handleShare = async () => {
    try {
      await navigator.share({
        title: name,
        text:  `Check out ${name} on Grove`,
        url:   `https://grove.sg/search?q=${nameSlug}`,
      });
    } catch { /* cancelled / unsupported */ }
  };

  const topRow: ActionBtnProps[] = [
    { label: "Maps",   href: mapsUrl },
    { label: "Grab",   href: `https://food.grab.com/sg/en/search?searchKeyword=${nameSlug}` },
    { label: "TikTok", href: `https://www.tiktok.com/search?q=${nameSlug}` },
  ];
  const bottomRow: ActionBtnProps[] = [
    phone
      ? { label: "Call",    href: `tel:${phone}` }
      : { label: "Call",    onClick: () => {} },
    { label: "Share",   onClick: handleShare },
    { label: "Reviews", href: reviewsUrl },
  ];

  // Decide card accent: Reddit gems get a subtle rose tint, NEA gets amber, normal stays white
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

      {/* Reddit gems get a single "Find on Maps" CTA instead */}
      {isRedditGem && (
        <div className="flex gap-1.5">
          <ActionBtn label="Find on Maps" href={mapsUrl} />
          <ActionBtn
            label="TikTok"
            href={`https://www.tiktok.com/search?q=${nameSlug}`}
          />
          {sourceUrl && (
            <ActionBtn label="Reddit thread" href={sourceUrl} />
          )}
        </div>
      )}
    </article>
  );
}
