import type { ProviderName } from "../settings";

export type Tier = "fast" | "smart";

export type GenerateTextInput = {
  /** fast = Haiku (summaries, extraction), smart = Sonnet (planning, writing). */
  tier: Tier;
  system: string;
  prompt: string;
  /** Ask for a single JSON object; the provider validates that the reply parses. */
  json?: boolean;
};

export type Usage = {
  inputChars: number;
  outputChars: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number;
  /** Counts toward MONTHLY_PAID_CAP_USD. */
  isPaid: boolean;
};

export type GenerateTextResult = {
  text: string;
  usage: Usage;
  provider: ProviderName | "fake";
  model: string;
};

export type CallOptions = { signal?: AbortSignal };

export interface AiProvider {
  readonly name: ProviderName | "fake";
  /** True when calls are billed per use and must respect the paid cap. */
  readonly paid: boolean;
  modelFor(tier: Tier): string;
  generateText(input: GenerateTextInput, opts?: CallOptions): Promise<GenerateTextResult>;
}

export type AiErrorCode =
  | "not_installed"
  | "timeout"
  | "aborted"
  | "cli_error"
  | "bad_output"
  | "not_configured"
  | "manual_pending"
  | "cap_reached";

const RETRYABLE: Record<AiErrorCode, boolean> = {
  not_installed: false,
  timeout: true,
  aborted: true,
  cli_error: true,
  bad_output: true,
  not_configured: false,
  manual_pending: false,
  cap_reached: false,
};

/** Error with a Vietnamese, user-facing message. Never include secrets in it. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  /** For manual mode: the full prompt the user should paste into a chat tool. */
  readonly pendingPrompt?: string;

  constructor(code: AiErrorCode, message: string, opts?: { pendingPrompt?: string }) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.retryable = RETRYABLE[code];
    this.pendingPrompt = opts?.pendingPrompt;
  }
}

export const JSON_INSTRUCTION =
  "Chỉ trả về đúng một đối tượng JSON hợp lệ. Không dùng markdown, không thêm lời giải thích.";

export function systemWithJson(system: string, json?: boolean): string {
  return json ? `${system.trim()}\n\n${JSON_INSTRUCTION}` : system;
}

/** Strips ```json fences if a model added them, then checks it parses. Returns the clean text. */
export function ensureJsonText(text: string): string {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    JSON.parse(cleaned);
  } catch {
    throw new AiError("bad_output", "AI trả về nội dung không phải JSON hợp lệ.");
  }
  return cleaned;
}
