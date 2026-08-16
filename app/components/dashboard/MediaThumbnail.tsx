"use client";

import Image from "next/image";
import { useState } from "react";

interface MediaThumbnailProps {
  src: string | null;
  alt: string;
  size?: number;
  className?: string;
}

/** Renders a Meta-hosted thumbnail, falling back to a quiet placeholder icon if the URL is
 *  missing OR fails to load (Meta CDN URLs carry short-lived signed expiries) — one broken image
 *  never breaks the surrounding card or table row. */
export function MediaThumbnail({ src, alt, size = 96, className = "" }: MediaThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-surface-sunken ${className}`}
      style={{ width: size, height: size }}
    >
      {showFallback ? (
        <div className="flex h-full w-full items-center justify-center text-ink-faint" aria-hidden="true">
          <svg width={Math.round(size * 0.28)} height={Math.round(size * 0.28)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
