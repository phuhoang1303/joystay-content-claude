/**
 * Tavily REST client (checked against docs.tavily.com on 2026-11-09):
 * - POST https://api.tavily.com/search  body { query, search_depth: "basic", max_results (0-20),
 *   topic: "general", country, language, include_raw_content: false, auto_parameters: false }
 *   -> { results: [{ title, url, content, score, raw_content }], response_time, ... }
 *   Cost: basic = 1 credit (advanced = 2; auto_parameters may switch to advanced, so it stays off).
 * - POST https://api.tavily.com/extract body { urls (1-20), extract_depth: "basic", format: "markdown",
 *   timeout } -> { results: [{ url, raw_content }], failed_results: [{ url, error }], usage }
 *   Cost: basic = 1 credit per 5 successful URLs. A 200 may still contain only failed_results.
 * - Auth: header `Authorization: Bearer <TAVILY_API_KEY>`.
 * - Errors: 400/422 invalid request, 401 bad key, 429 rate limit (Retry-After), 432 key/plan limit,
 *   433 pay-as-you-go limit, 500 server error.
 */

export type SearchResult = { title: string; url: string; content: string; score: number };
export type ExtractResult = { url: string; rawContent: string };
export type ExtractFailure = { url: string; error: string };

export interface TavilyClient {
  search(p: { query: string; maxResults?: number }): Promise<{ results: SearchResult[]; credits: number }>;
  extract(urls: string[]): Promise<{ results: ExtractResult[]; failed: ExtractFailure[]; credits: number }>;
}

export const SEARCH_CREDITS_BASIC = 1;
export const EXTRACT_URLS_PER_CREDIT = 5;
export const MAX_EXTRACT_URLS = 20;

/** Credits for one basic extract call with `successful` URLs. */
export function extractCredits(successful: number): number {
  return Math.ceil(Math.max(0, successful) / EXTRACT_URLS_PER_CREDIT);
}

export type TavilyErrorCode =
  | "missing_key"
  | "unauthorized"
  | "plan_limit"
  | "rate_limited"
  | "server_error"
  | "bad_request"
  | "network"
  | "cap_reached";

const RETRYABLE: Record<TavilyErrorCode, boolean> = {
  missing_key: false,
  unauthorized: false,
  plan_limit: false,
  rate_limited: true,
  server_error: true,
  bad_request: false,
  network: true,
  cap_reached: false,
};

/** Vietnamese, user-facing message. Never includes the key. */
export class TavilyError extends Error {
  readonly code: TavilyErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  constructor(code: TavilyErrorCode, message: string, status?: number) {
    super(message);
    this.name = "TavilyError";
    this.code = code;
    this.retryable = RETRYABLE[code];
    this.status = status;
  }
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export type TavilyOptions = {
  /** Defaults to process.env.TAVILY_API_KEY, read at call time. */
  apiKey?: string;
  fetch?: FetchFn;
  baseUrl?: string;
  timeoutMs?: number;
};

export function errorFromStatus(status: number): TavilyError {
  if (status === 401)
    return new TavilyError("unauthorized", "Tavily từ chối khoá API (401). Kiểm tra TAVILY_API_KEY trong .env.local.", status);
  if (status === 432 || status === 433)
    return new TavilyError("plan_limit", `Tavily báo đã hết hạn mức của gói (${status}). Kiểm tra tài khoản Tavily.`, status);
  if (status === 429)
    return new TavilyError("rate_limited", "Tavily đang giới hạn tốc độ (429). Sẽ thử lại sau.", status);
  if (status >= 500)
    return new TavilyError("server_error", `Tavily đang lỗi máy chủ (${status}). Sẽ thử lại sau.`, status);
  return new TavilyError("bad_request", `Tavily từ chối yêu cầu (${status}).`, status);
}

export function createTavilyClient(opts: TavilyOptions = {}): TavilyClient {
  const doFetch: FetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
  const baseUrl = opts.baseUrl ?? "https://api.tavily.com";
  const timeoutMs = opts.timeoutMs ?? 45_000;

  async function post<T>(path: string, body: unknown): Promise<T> {
    const key = (opts.apiKey ?? process.env.TAVILY_API_KEY ?? "").trim();
    if (!key) {
      throw new TavilyError(
        "missing_key",
        "Chưa có TAVILY_API_KEY. Thêm khoá Tavily vào file .env.local rồi khởi động lại npm run dev.",
      );
    }
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new TavilyError("network", "Không kết nối được tới Tavily (mạng hoặc hết thời gian chờ).");
    }
    if (!res.ok) throw errorFromStatus(res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new TavilyError("server_error", "Tavily trả về dữ liệu không đọc được.");
    }
  }

  return {
    async search({ query, maxResults = 8 }) {
      const data = await post<{ results?: Partial<SearchResult>[] }>("/search", {
        query,
        search_depth: "basic",
        max_results: Math.min(20, Math.max(1, maxResults)),
        topic: "general",
        country: "vietnam",
        language: "vi",
        include_raw_content: false,
        include_answer: false,
        auto_parameters: false,
      });
      const results = (data.results ?? [])
        .filter((r): r is SearchResult => typeof r.url === "string")
        .map((r) => ({
          title: String(r.title ?? ""),
          url: r.url,
          content: String(r.content ?? ""),
          score: Number(r.score ?? 0),
        }));
      return { results, credits: SEARCH_CREDITS_BASIC };
    },

    async extract(urls) {
      if (urls.length === 0) return { results: [], failed: [], credits: 0 };
      if (urls.length > MAX_EXTRACT_URLS) throw new TavilyError("bad_request", "Tối đa 20 URL mỗi lần extract.");
      const data = await post<{
        results?: { url?: string; raw_content?: string }[];
        failed_results?: { url?: string; error?: string }[];
      }>("/extract", { urls, extract_depth: "basic", format: "markdown", timeout: 30 });
      const results = (data.results ?? [])
        .filter((r) => typeof r.url === "string" && typeof r.raw_content === "string" && r.raw_content.trim())
        .map((r) => ({ url: r.url as string, rawContent: r.raw_content as string }));
      const ok = new Set(results.map((r) => r.url));
      const failed = [
        ...(data.failed_results ?? []).map((f) => ({ url: String(f.url ?? ""), error: String(f.error ?? "lỗi") })),
        ...urls
          .filter((u) => !ok.has(u) && !(data.failed_results ?? []).some((f) => f.url === u))
          .map((u) => ({ url: u, error: "không có nội dung" })),
      ];
      return { results, failed, credits: extractCredits(results.length) };
    },
  };
}
