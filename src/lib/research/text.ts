/** Vietnamese text helpers: diacritic-insensitive normalisation and tokens. */

export function normalizeVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** Words that carry no topic meaning in a keyword (already normalised). */
const STOPWORDS = new Set([
  "o",
  "tai",
  "va",
  "cua",
  "cho",
  "la",
  "nhung",
  "cac",
  "mot",
  "voi",
  "the",
  "nay",
  "khi",
  "de",
  "tu",
  "den",
  "trong",
  "co",
]);

export function tokensVi(s: string): string[] {
  return normalizeVi(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function keywordTokens(keyword: string): string[] {
  return [...new Set(tokensVi(keyword).filter((t) => !STOPWORDS.has(t)))];
}

/** Collapses markdown/whitespace into plain text. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prices, opening hours, addresses, phone numbers: facts that go stale. */
export function looksVolatile(text: string): boolean {
  const n = normalizeVi(text);
  return (
    /\d[\d.,]*\s*(d|dong|vnd|k|nghin|ngan|trieu|usd|\$)\b/.test(n) ||
    /\b\d{1,2}\s*(h|g|gio)\s*\d{0,2}\b/.test(n) ||
    /\b\d{1,2}:\d{2}\b/.test(n) ||
    /\b(gio mo cua|mo cua|dong cua|gia ve|gia phong|gia tu|bang gia)\b/.test(n) ||
    /\b(so \d+|\d+\s+(duong|pho)|duong [a-z]|phuong \d+|quan \d+|dia chi)\b/.test(n) ||
    /(\+84|\b0)\d{2,3}[\s.]?\d{3}[\s.]?\d{3,4}\b/.test(n)
  );
}
