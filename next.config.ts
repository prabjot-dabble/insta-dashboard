import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Meta's CDN serves media/thumbnails from many rotating regional subdomains (e.g.
    // scontent.fblr20-3.fna.fbcdn.net, instagram.fblr20-1.fna.fbcdn.net) — verified against the
    // real Dabble account across Prompts 3-6. Wildcarding the two parent domains covers all of
    // them rather than trying to enumerate specific regional hosts.
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
    ],
  },
};

export default nextConfig;
