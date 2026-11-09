import type { Db } from "../db/client";
import { aiUsage } from "../db/schema";
import { capStatus } from "../cost/cap";
import { getProviderName, type ProviderName } from "../settings";
import { createClaudeCliProvider } from "./claude-cli";
import { createAnthropicApiProvider, createManualProvider } from "./stubs";
import {
  AiError,
  type AiProvider,
  type CallOptions,
  type GenerateTextInput,
  type GenerateTextResult,
} from "./types";

export * from "./types";

export function createProvider(name: ProviderName): AiProvider {
  switch (name) {
    case "claude-cli":
      return createClaudeCliProvider();
    case "anthropic-api":
      return createAnthropicApiProvider();
    case "manual":
      return createManualProvider();
  }
}

export type AiCallContext = {
  db: Db;
  workspaceId: number;
  /** What the call is for, stored in ai_usage.step. */
  step: string;
  jobId?: number | null;
  contentItemId?: number | null;
  /** Override (tests); otherwise the provider chosen in Settings. */
  provider?: AiProvider;
  signal?: AbortSignal;
};

export type LoggedResult = GenerateTextResult & { usageId: number };

/**
 * The only way feature code should call AI. Enforces the paid cap and writes exactly one
 * ai_usage row per call (success or failure).
 */
export async function generateText(
  ctx: AiCallContext,
  input: GenerateTextInput,
): Promise<LoggedResult> {
  const provider = ctx.provider ?? createProvider(getProviderName(ctx.db));
  const model = provider.modelFor(input.tier);
  const inputChars = input.system.length + input.prompt.length;
  const started = Date.now();

  const log = (row: Partial<typeof aiUsage.$inferInsert>) =>
    ctx.db
      .insert(aiUsage)
      .values({
        workspaceId: ctx.workspaceId,
        step: ctx.step,
        provider: provider.name,
        model,
        inputChars,
        jobId: ctx.jobId ?? null,
        contentItemId: ctx.contentItemId ?? null,
        durationMs: Date.now() - started,
        isPaid: provider.paid,
        ...row,
      })
      .returning({ id: aiUsage.id })
      .get().id;

  if (provider.paid) {
    const cap = capStatus(ctx.db);
    if (cap.level === "blocked") {
      const err = new AiError(
        "cap_reached",
        `Đã chạm hạn mức chi phí API trả phí tháng này (${cap.spendUsd.toFixed(2)}/${cap.capUsd.toFixed(2)} USD). Tăng hạn mức trong Cài đặt hoặc chuyển sang claude-cli.`,
      );
      log({ ok: false, error: err.message });
      throw err;
    }
  }

  const callOpts: CallOptions = { signal: ctx.signal };
  try {
    const result = await provider.generateText(input, callOpts);
    const usageId = log({
      model: result.model,
      outputChars: result.usage.outputChars,
      inputChars: result.usage.inputChars,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.usage.costUsd,
      isPaid: result.usage.isPaid,
      ok: true,
    });
    return { ...result, usageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log({ ok: false, error: message.slice(0, 1000) });
    throw err;
  }
}
