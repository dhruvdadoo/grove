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

// ─── Evidence chip builder ────────────────────────────────────────────────────

interface EvidenceChip { label: string; style: React.CSSProperties }

const CHIP_BASE: React.CSSProperties = {
  fontSize: "11px", fontWeight: 500,
  padding: "3px 9px", borderRadius: "9999px",
  whiteSpace: "nowrap",
  lineHeight: "1.6",
};

function buildEvidenceChips(r: Restaurant & {
  userRatingCount?: number;
  photoName?: string;
}): EvidenceChip[] {
  const chips: EvidenceChip[] = [];

  // Dietary (highest priority — most critical to users)
  if (r.tags?.includes("Halal"))
    chips.push({ label: "Halal", style: { ...CHIP_BASE, background: "#EDFBF3", color: "#1A6B40", border: "1px solid #C3F0D4" } });
  if (r.tags?.includes("Vegetarian") || r.tags?.includes("Vegan"))
    chips.push({ label: r.tags.includes("Vegan") ? "Vegan" : "Vegetarian", style: { ...CHIP_BASE, background: "#F3FAE8", color: "#4A7C1F", border: "1px solid #CEEAA3" } });
  if (r.tags?.includes("No Pork"))
    chips.push({ label: "No Pork", style: { ...CHIP_BASE, background: "#FFF8F0", color: "#8B5218", border: "1px solid #F0D9BC" } });

  // Open status
  if (r.isOpen)
    chips.push({ label: "Open Now", style: { ...CHIP_BASE, background: "#EDFBF3", color: "#1A6B40", border: "1px solid #C3F0D4" } });

  // Quality signals
  if (r.rating !== undefined && r.rating >= 4.5)
    chips.push({ label: "Highly Rated", style: { ...CHIP_BASE, background: "#FFF8EC", color: "#8B5218", border: "1px solid #F0D9BC" } });
  if (r.userRatingCount !== undefined && r.userRatingCount >= 1000)
    chips.push({ label: "Popular", style: { ...CHIP_BASE, background: "#EFF6FF", color: "#2B5AB8", border: "1px solid #C0D8F8" } });
  if (r.rating !== undefined && r.rating >= 4.0 && (!r.userRatingCount || r.userRatingCount < 200))
    chips.push({ label: "Hidden Gem", style: { ...CHIP_BASE, background: "#F5F3FF", color: "#6D28D9", border: "1px solid #DDD6FE" } });

  // Source
  if (r.sources?.includes("reddit"))
    chips.push({ label: "Reddit Pick", style: { ...CHIP_BASE, background: "#FFF1F2", color: "#BE123C", border: "1px solid #FECDD3" } });

  // Format / price
  if (r.isHawkerCentre || r.tags?.includes("Hawker Centre"))
    chips.push({ label: "Hawker", style: { ...CHIP_BASE, background: "#FFF3E0", color: "#C45500", border: "1px solid #FFD8A8" } });
  if (r.priceRange === 1)
    chips.push({ label: "Under $15", style: { ...CHIP_BASE, background: "#F0EDE8", color: "#5C5852", border: "1px solid #DDD9D4" } });

  return chips.slice(0, 4);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const PriceIndicator = ({ level }: { level: 1 | 2 | 3 }) => (
  <span className="font-sans text-sm tracking-wider">
    {[1, 2, 3].map((i) => (
      <span key={i} style={{ color: i <= level ? "#2D4A3E" : "#D4D0CB", fontWeight: i <= level ? "600" : "400" }}>$</span>
    ))}
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
  const keyword  = encodeURIComponent(`${name} ${city}`);
  const webUrl   = `https://www.tiktok.com/search?q=${keyword}`;
  const platform = getPlatform();

  if (typeof window === "undefined") return;

  if (platform === "ios") {
    window.location.href = `snssdk1233://search?keyword=${keyword}`;
    setTimeout(() => { window.open(webUrl, "_blank"); }, 500);
  } else if (platform === "android") {
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
    blogPostUrls?:    string[];
    photoName?:       string;
    hoursDisplay?:    string;
    opensNextAt?:     string;
    todaySessions?:   Array<{ open: string; close: string }>;
    matchBullets?:    string[];
  };
  city?: string;
}

export default function ResultCard({ restaurant, city = "Singapore" }: ResultCardProps) {
  const {
    name, location, cuisine, priceRange,
    isOpen, closingTime, hoursDisplay, opensNextAt,
    tags, distance,
    matchReason, matchBullets, score,
    phone, rating, placeId,
    sources = ["google"], blogSources, blogPostUrls, redditMentions,
    isRedditGem, isBlogPick, isHawkerCentre, sourceUrl,
    websiteUri, reservable, dineIn, userRatingCount,
    photoName,
  } = restaurant;

  // ── URL building ──────────────────────────────────────────────────────────────
  const mapsUrl    = `https://maps.google.com/?q=${encodeURIComponent(`${name} ${location}`)}`;
  const reviewsUrl = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} reviews`)}`;

  const isHawkerOrBudget = isHawkerCentre || priceRange === 1;
  const BOOKING_PLATFORMS = ["chope", "sevenrooms", "tableapp", "eatigo", "quandoo", "resy", "opentable"];
  const hasBookingUrl = websiteUri && BOOKING_PLATFORMS.some((p) => websiteUri!.toLowerCase().includes(p));

  let bookingLabel = "Menu";
  let bookingUrl: string;
  if (isHawkerOrBudget) {
    bookingLabel = "Menu";
    bookingUrl   = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} menu`)}`;
  } else if (hasBookingUrl) {
    bookingLabel = "Book";
    bookingUrl   = websiteUri!;
  } else if (reservable || dineIn || (userRatingCount && userRatingCount > 50)) {
    bookingLabel = "Book";
    bookingUrl   = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} reserve table`)}`;
  } else {
    bookingLabel = "Menu";
    bookingUrl   = `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} menu`)}`;
  }

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

  // ── Computed values ───────────────────────────────────────────────────────────
  const cardBg           = isHawkerCentre ? "#FFFDF5" : "#FFFFFF";
  const hasReddit        = sources.includes("reddit");
  const hasBlog          = sources.includes("blog");
  const hasGoogle        = sources.includes("google");
  const locallyMentioned = (hasReddit || hasBlog) && hasGoogle;
  const firstBlogPostUrl = blogPostUrls?.[0] ?? (isBlogPick ? sourceUrl : undefined);

  // Evidence chips (max 4)
  const evidenceChips = buildEvidenceChips({ ...restaurant, userRatingCount, photoName });

  // Match % badge (only for Claude-ranked places with a real score)
  const matchPct = score && score > 0 ? Math.round(score * 10) : null;

  // Evidence bullets: use Claude's bullets, fall back to data-derived
  const bullets: string[] = matchBullets?.length
    ? matchBullets.slice(0, 3)
    : (() => {
        const b: string[] = [];
        if (hoursDisplay && hoursDisplay !== "Hours unknown" && hoursDisplay !== "Hours vary") {
          b.push(hoursDisplay);
        } else if (isOpen && closingTime) {
          b.push(`Open until ${closingTime}`);
        } else if (opensNextAt) {
          b.push(`Opens again at ${opensNextAt}`);
        }
        if (tags?.includes("Halal"))      b.push("Halal certified");
        if (tags?.includes("Vegetarian")) b.push("Vegetarian-friendly");
        if (rating && userRatingCount)    b.push(`${rating.toFixed(1)}★ · ${userRatingCount.toLocaleString()} reviews`);
        else if (rating)                  b.push(`Rated ${rating.toFixed(1)}★`);
        if (hasReddit)                    b.push("Mentioned by locals on Reddit");
        return b.slice(0, 3);
      })();

  // Action rows
  const topRow: ActionBtnProps[] = [
    { label: "Maps",       href: mapsUrl },
    { label: bookingLabel, href: bookingUrl },
    { label: "TikTok",     onClick: () => openTikTok(name, city) },
  ];
  const bottomRow: ActionBtnProps[] = [
    phone ? { label: "Call", href: `tel:${phone}` } : { label: "Call", disabled: true },
    { label: "Share",   onClick: handleShare },
    { label: "Reviews", href: reviewsUrl },
  ];

  // Hours status display
  const openStatusText = isOpen
    ? (hoursDisplay && hoursDisplay.startsWith("Lunch") || hoursDisplay?.includes("·")
        ? `Open · ${hoursDisplay}`
        : `Open · Closes ${closingTime}`)
    : opensNextAt
      ? `Closed · Opens ${opensNextAt}`
      : `Closed`;

  return (
    <article
      className="flex flex-col rounded-2xl border transition-all duration-200"
      style={{
        background:  cardBg,
        borderColor: isHawkerCentre ? "#FFB74D" : "#E8E4DF",
        overflow:    "hidden",
        boxShadow:   "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(45,74,62,0.08)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)")}
    >
      {/* ── Photo / placeholder ─────────────────────────────────────────── */}
      <div style={{ height: "160px", flexShrink: 0, position: "relative", overflow: "hidden" }}>
        {photoName ? (
          <img
            src={`/api/photo?name=${encodeURIComponent(photoName)}`}
            alt={name}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              const wrap = img.parentElement;
              if (wrap) {
                img.style.display = "none";
                wrap.style.background = "#F0EDE8";
                wrap.style.display = "flex";
                wrap.style.alignItems = "center";
                wrap.style.justifyContent = "center";
                const span = document.createElement("span");
                span.textContent = cuisine;
                span.style.cssText = "color:#9B9590;font-size:13px;font-family:sans-serif";
                wrap.appendChild(span);
              }
            }}
          />
        ) : (
          <div
            style={{
              width: "100%", height: "100%",
              background: isHawkerCentre ? "#FFF3E0" : "#F0EDE8",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span className="font-sans text-sm" style={{ color: "#9B9590" }}>{cuisine}</span>
          </div>
        )}
      </div>

      {/* ── Card content ────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1" style={{ padding: "16px 20px 20px" }}>

        {/* Header: name + price */}
        <div className="flex items-start justify-between gap-3 mb-2">
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

        {/* Status + distance + rating */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: isOpen ? "#2D9C64" : "#C0392B" }} />
            <span className="text-xs font-sans font-medium"
              style={{ color: isOpen ? "#1A6B40" : "#922B21", lineHeight: "1.4" }}>
              {openStatusText}
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
              <span className="text-xs font-sans font-medium" style={{ color: "#2D4A3E" }}>
                ★ {rating.toFixed(1)}
                {userRatingCount !== undefined && (
                  <span className="font-normal" style={{ color: "#6B6561" }}>
                    {" "}({userRatingCount.toLocaleString()})
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Evidence chips (max 4) */}
        {evidenceChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {evidenceChips.map((chip) => (
              <span key={chip.label} className="font-sans" style={chip.style}>{chip.label}</span>
            ))}
          </div>
        )}

        {/* Source attribution */}
        {(locallyMentioned || hasBlog || (hasReddit && !sources.includes("google")) || sources.includes("nea")) && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {locallyMentioned && <LocalsBadge />}
            {hasBlog && (blogSources?.length ? blogSources : [undefined]).map((bs, i) => (
              <SourceBadge key={`blog-${bs ?? i}`} source="blog"
                extra={`📖 Featured in ${bs ?? "food blog"}`} />
            ))}
            {hasBlog && firstBlogPostUrl && (
              <a href={firstBlogPostUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-sans font-semibold underline"
                style={{ color: "#6D28D9", alignSelf: "center" }}>
                Read post ↗
              </a>
            )}
            {hasReddit && !hasGoogle && (
              <SourceBadge key="reddit" source="reddit"
                extra={redditMentions && redditMentions > 1 ? `🔴 Reddit ×${redditMentions}` : "🔴 Reddit"} />
            )}
            {hasReddit && isRedditGem && sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] font-sans font-semibold underline"
                style={{ color: "#BE123C", alignSelf: "center" }}>
                View thread ↗
              </a>
            )}
            {sources.includes("nea") && <SourceBadge key="nea" source="nea" />}
          </div>
        )}

        {/* Match reason / confidence box */}
        <div
          className="rounded-xl p-3 mb-4 flex-1"
          style={{
            background: isRedditGem ? "#FFF5F7" : isHawkerCentre ? "#FFF9F0" : "#F5F8F6",
            border: `1px solid ${isRedditGem ? "#FECDD3" : isHawkerCentre ? "#FFD580" : "#DCE9E3"}`,
          }}
        >
          {/* Header row: icon + label + match % */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: isRedditGem ? "#BE123C" : "#2D4A3E" }}>
                {isRedditGem ? "🔴" : isHawkerCentre ? "🏛️" : "✦"}
              </span>
              <span className="text-[10px] font-sans font-semibold tracking-widest uppercase"
                style={{ color: isRedditGem ? "#BE123C" : "#2D4A3E" }}>
                {isRedditGem ? "Why locals love it" : isHawkerCentre ? "About this hawker centre" : "Matches because"}
              </span>
            </div>
            {matchPct !== null && (
              <span className="text-[11px] font-sans font-semibold" style={{ color: "#2D4A3E" }}>
                {matchPct}% match
              </span>
            )}
          </div>

          {/* Bullets or paragraph */}
          {bullets.length > 0 ? (
            <ul className="space-y-0.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="flex-shrink-0 text-xs" style={{ color: "#2D4A3E", marginTop: "1px" }}>·</span>
                  <span className="text-xs font-sans leading-snug" style={{ color: "#3D5248" }}>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs font-sans leading-relaxed" style={{ color: "#3D5248" }}>
              {matchReason}
            </p>
          )}
        </div>

        {/* Action buttons */}
        {!isRedditGem && !isBlogPick ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              {topRow.map((btn) => <ActionBtn key={btn.label} {...btn} />)}
            </div>
            <div className="flex gap-1.5">
              {bottomRow.map((btn) => <ActionBtn key={btn.label} {...btn} />)}
            </div>
          </div>
        ) : isRedditGem ? (
          <div className="flex gap-1.5">
            <ActionBtn label="Find on Maps" href={mapsUrl} />
            <ActionBtn label="TikTok" onClick={() => openTikTok(name, city)} />
            {sourceUrl && <ActionBtn label="Reddit thread" href={sourceUrl} />}
          </div>
        ) : (
          <div className="flex gap-1.5">
            <ActionBtn label="Find on Maps" href={mapsUrl} />
            <ActionBtn label="TikTok" onClick={() => openTikTok(name, city)} />
            {firstBlogPostUrl && <ActionBtn label="Read post ↗" href={firstBlogPostUrl} />}
          </div>
        )}
      </div>
    </article>
  );
}
