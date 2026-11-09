import "server-only";

/**
 * Env keys the platform knows about. Only presence is ever reported; values never leave the server.
 * Keep in sync with .env.example.
 */
export const ENV_KEYS: { key: string; label: string; phase: number }[] = [
  { key: "DATA_DIR", label: "Thư mục dữ liệu (tuỳ chọn, mặc định .data)", phase: 0 },
  { key: "MONTHLY_PAID_CAP_USD", label: "Hạn mức chi phí mặc định (tuỳ chọn)", phase: 0 },
  { key: "CLAUDE_CLI_PATH", label: "Đường dẫn lệnh claude (tuỳ chọn)", phase: 0 },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API (chế độ anthropic-api)", phase: 0 },
  { key: "TAVILY_API_KEY", label: "Tavily (research)", phase: 1 },
  { key: "SANITY_PROJECT_ID", label: "Sanity project ID", phase: 2 },
  { key: "SANITY_DATASET", label: "Sanity dataset", phase: 2 },
  { key: "SANITY_API_TOKEN", label: "Sanity write token", phase: 2 },
  { key: "GOOGLE_CLIENT_ID", label: "Google OAuth client ID (Drive)", phase: 4 },
  { key: "GOOGLE_CLIENT_SECRET", label: "Google OAuth client secret (Drive)", phase: 4 },
  { key: "GEMINI_API_KEY", label: "Gemini API (ảnh AI)", phase: 4 },
  { key: "OPENAI_API_KEY", label: "OpenAI (ảnh AI dự phòng)", phase: 4 },
  { key: "PEXELS_API_KEY", label: "Pexels (ảnh stock)", phase: 4 },
  { key: "UNSPLASH_ACCESS_KEY", label: "Unsplash (ảnh stock)", phase: 4 },
];

export type EnvStatus = { key: string; label: string; phase: number; present: boolean };

/** Returns presence only (boolean). Never return or log the value. */
export function getEnvStatus(env: NodeJS.ProcessEnv = process.env): EnvStatus[] {
  return ENV_KEYS.map((k) => ({ ...k, present: Boolean(env[k.key]?.trim()) }));
}
