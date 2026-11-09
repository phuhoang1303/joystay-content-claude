import {
  extractCredits,
  SEARCH_CREDITS_BASIC,
  TavilyError,
  type ExtractResult,
  type SearchResult,
  type TavilyClient,
} from "./tavily";

export type FakeTavilyOptions = {
  /** query -> results; default generates `perQuery` results with unique URLs. */
  search?: (query: string) => SearchResult[];
  perQuery?: number;
  /** url -> page text, or null to fail that URL. Default: a Vietnamese page mentioning the URL. */
  page?: (url: string) => string | null;
  /** Throw this error on every call. */
  error?: TavilyError;
};

/** Deterministic Tavily for tests. Records calls. */
export function createFakeTavily(opts: FakeTavilyOptions = {}) {
  const calls: { kind: "search" | "extract"; arg: string | string[] }[] = [];
  let counter = 0;
  const client: TavilyClient & { calls: typeof calls } = {
    calls,
    async search({ query, maxResults = 8 }) {
      calls.push({ kind: "search", arg: query });
      if (opts.error) throw opts.error;
      const results =
        opts.search?.(query) ??
        Array.from({ length: Math.min(maxResults, opts.perQuery ?? maxResults) }, () => {
          counter++;
          return {
            title: `Bài ${counter} về ${query}`,
            url: `https://site${counter}.vn/bai-${counter}`,
            content: `Nội dung ${counter}`,
            score: 1 - counter / 1000,
          };
        });
      return { results, credits: SEARCH_CREDITS_BASIC };
    },
    async extract(urls) {
      calls.push({ kind: "extract", arg: urls });
      if (opts.error) throw opts.error;
      const results: ExtractResult[] = [];
      const failed: { url: string; error: string }[] = [];
      for (const url of urls) {
        const text = opts.page ? opts.page(url) : `# Trang ${url}\n\nGiá phòng từ 500.000đ. Mở cửa 7h-22h.`;
        if (text === null) failed.push({ url, error: "fake failure" });
        else results.push({ url, rawContent: text });
      }
      return { results, failed, credits: extractCredits(results.length) };
    },
  };
  return client;
}
