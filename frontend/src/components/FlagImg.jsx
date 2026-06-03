import { useState } from "react";
import "../styles/flag.css";

/**
 * Renders a country flag using flagcdn.com.
 * Falls back to the Unicode flag emoji on image error.
 * Applies a gentle wave animation on hover.
 *
 * @param {string} code  - ISO 3166-1 alpha-2 code, e.g. "IN", "US"
 * @param {number} size  - Width in pixels (height auto-computed at 3:4 ratio)
 * @param {string} className
 */
export default function FlagImg({ code, size = 24, className = "" }) {
  const [broken, setBroken] = useState(false);

  if (!code || code.length !== 2) return null;

  const lc     = code.toLowerCase();
  const height = Math.round(size * 0.75); // 4:3 ratio
  // Use the 2x version for retina clarity: flagcdn.com/40x30/xx.png
  const w      = size <= 20 ? 40  : size <= 32 ? 48  : 64;
  const h      = size <= 20 ? 30  : size <= 32 ? 36  : 48;
  const src    = `https://flagcdn.com/${w}x${h}/${lc}.png`;
  const src2x  = `https://flagcdn.com/${w * 2}x${h * 2}/${lc}.png`;

  if (broken) {
    // Unicode flag emoji fallback — always correct, no network required
    const codePoints = code.toUpperCase().split("").map(
      (c) => 127397 + c.charCodeAt(0)
    );
    const emoji = String.fromCodePoint(...codePoints);
    return (
      <span
        className={`crm-flag-emoji ${className}`}
        style={{ fontSize: size * 0.9, lineHeight: 1, display: "inline-block", flexShrink: 0 }}
        title={code}
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      src={src}
      srcSet={`${src} 1x, ${src2x} 2x`}
      alt={code}
      title={code}
      loading="lazy"
      width={size}
      height={height}
      className={`crm-flag ${className}`}
      onError={() => setBroken(true)}
    />
  );
}
