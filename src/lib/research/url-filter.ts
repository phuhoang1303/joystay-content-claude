import type { SearchResult } from "./tavily";

/** Social networks and video sites: never researched automatically (CLAUDE.md rule 3). */
const BLOCKED_HOSTS = [
  "facebook.com",
  "fb.com",
  "fb.watch",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "threads.net",
  "linkedin.com",
  "pinterest.com",
  "zalo.me",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "dailymotion.com",
  "reddit.com",
];

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|ref$|ref_src$|igshid$)/i;

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostMatches(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

/** Lowercase host, no www, no hash, no tracking params, no trailing slash. Null if not http(s). */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  const s = u.toString();
  return u.pathname === "/" && !u.search ? s.replace(/\/$/, "") : s;
}

export function isSocialOrVideo(url: string): boolean {
  const host = domainOf(url);
  return BLOCKED_HOSTS.some((b) => hostMatches(host, b));
}

/** Junk for automatic research: social/video, PDFs and other files, the owner's own sites. */
export function isJunk(url: string, ownDomains: string[] = []): boolean {
  const host = domainOf(url);
  if (!host) return true;
  if (isSocialOrVideo(url)) return true;
  if (ownDomains.some((d) => d && hostMatches(host, d))) return true;
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  return /\.(pdf|docx?|xlsx?|pptx?|zip|rar|jpe?g|png|gif|webp|mp4|mp3)$/.test(path);
}

export type Candidate = {
  url: string;
  title: string;
  score: number;
  state: "pending" | "done" | "failed";
  error?: string;
};

/**
 * Normalises and dedupes search results, drops junk and already-known URLs, ranks by best score
 * plus a bonus for appearing in several queries, keeps at most `perDomain` per site, returns `limit`.
 */
export function rankCandidates(
  resultSets: SearchResult[][],
  opts: { ownDomains?: string[]; exclude?: Iterable<string>; limit?: number; perDomain?: number } = {},
): Candidate[] {
  const exclude = new Set(opts.exclude ?? []);
  const byUrl = new Map<string, { url: string; title: string; best: number; hits: number }>();
  for (const set of resultSets) {
    for (const r of set) {
      const url = normalizeUrl(r.url);
      if (!url || exclude.has(url) || isJunk(url, opts.ownDomains)) continue;
      const cur = byUrl.get(url);
      if (cur) {
        cur.hits++;
        cur.best = Math.max(cur.best, r.score);
      } else byUrl.set(url, { url, title: r.title, best: r.score, hits: 1 });
    }
  }
  const ranked = [...byUrl.values()]
    .map((c) => ({ ...c, rank: c.best + 0.1 * (c.hits - 1) }))
    .sort((a, b) => b.rank - a.rank);

  const perDomain = opts.perDomain ?? 2;
  const counts = new Map<string, number>();
  const out: Candidate[] = [];
  for (const c of ranked) {
    const d = domainOf(c.url);
    if ((counts.get(d) ?? 0) >= perDomain) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
    out.push({ url: c.url, title: c.title, score: Number(c.rank.toFixed(4)), state: "pending" });
    if (out.length >= (opts.limit ?? 15)) break;
  }
  return out;
}
