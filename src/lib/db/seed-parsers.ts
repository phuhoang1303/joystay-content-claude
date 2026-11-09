/** Pure parsers that turn the markdown seed docs into rows. No I/O here, so they are easy to test. */

export type BrandFields = {
  name: string;
  tagline: string;
  website: string;
  location: string;
  description: string;
  targetGuests: string;
  rooms: string;
  contact: string;
};

/** Reads lines like `- **Name:** value` into a map keyed by the bold label. */
export function parseBoldBullets(md: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of md.split(/\r?\n/)) {
    const m = /^\s*-\s+\*\*(.+?):\*\*\s*(.*)$/.exec(line);
    if (m) map.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  return map;
}

export function parseBrandProfile(md: string): BrandFields {
  const b = parseBoldBullets(md);
  const get = (k: string) => b.get(k) ?? "";
  const lines = (pairs: [string, string][]) =>
    pairs
      .filter(([, v]) => v)
      .map(([label, v]) => `${label}: ${v}`)
      .join("\n");

  return {
    name: get("name"),
    tagline: get("tagline"),
    website: get("website"),
    location: get("location"),
    description: lines([
      ["Loại hình", get("type")],
      ["Điểm nổi bật", get("key features")],
      ["Giọng thương hiệu", get("tone")],
      ["Xưng hô trên fanpage", get("fanpage voice")],
      ["Ngôn ngữ nội dung", get("content language")],
      ["Internal link (SEO)", get("internal link targets (seo)")],
    ]),
    targetGuests: get("target guests"),
    rooms: lines([
      ["Phòng", get("rooms")],
      ["Giá", get("price")],
    ]),
    contact: get("contact channels"),
  };
}

/** Bullet items under the "Banned phrases" heading of social-style.md, one per line. */
export function parseBannedPhrases(md: string): string[] {
  const out: string[] = [];
  let inSection = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line)) {
      inSection = /banned phrases/i.test(line);
      continue;
    }
    if (!inSection) continue;
    const m = /^\s*-\s+(.*)$/.exec(line);
    if (m && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}

export function parseUrls(md: string): string[] {
  const urls = md.match(/https?:\/\/[^\s)>\]]+/g) ?? [];
  return [...new Set(urls)];
}

export type ParsedSocialExample = {
  seedKey: string;
  format: string;
  source: string;
  title: string;
  body: string;
};

/** Splits social-examples.md on `---` and reads `## N. Format: X (source: Y)` headings. */
export function parseSocialExamples(md: string): ParsedSocialExample[] {
  const out: ParsedSocialExample[] = [];
  for (const chunk of md.split(/^---\s*$/m)) {
    const lines = chunk.split(/\r?\n/);
    const headingIdx = lines.findIndex((l) => /^##\s+\d+\.\s*Format:/i.test(l));
    if (headingIdx === -1) continue;
    const m = /^##\s+(\d+)\.\s*Format:\s*(.+?)\s*(?:\(source:\s*(.+?)\))?\s*$/i.exec(
      lines[headingIdx],
    );
    if (!m) continue;
    const body = lines
      .slice(headingIdx + 1)
      .join("\n")
      .trim();
    const title = body.split(/\r?\n/).find((l) => l.trim())?.trim() ?? m[2];
    out.push({
      seedKey: `social-${m[1]}`,
      format: m[2].trim(),
      source: (m[3] ?? "").trim(),
      title: title.length > 100 ? `${title.slice(0, 97).trimEnd()}…` : title,
      body,
    });
  }
  return out;
}

export const DEFAULT_PILLARS = [
  "Ăn uống địa phương",
  "Du lịch & lịch trình Sài Gòn",
  "Mẹo đặt phòng & chuẩn bị chuyến đi",
  "Trải nghiệm ở Joystay",
  "Ưu đãi theo mùa",
] as const;
