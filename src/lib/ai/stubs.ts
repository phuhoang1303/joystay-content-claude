import { AiError, systemWithJson, type AiProvider, type Tier } from "./types";

const API_MODELS: Record<Tier, string> = {
  fast: "claude-haiku-5-5",
  smart: "claude-sonnet-5-5",
};

/** Paid Anthropic API. Interface-complete stub; the real client arrives in a later phase. */
export function createAnthropicApiProvider(): AiProvider {
  return {
    name: "anthropic-api",
    paid: true,
    modelFor: (tier) => API_MODELS[tier],
    async generateText() {
      throw new AiError(
        "not_configured",
        'Chế độ "anthropic-api" chưa được hoàn thiện (sẽ làm ở phase sau). Hãy chọn "claude-cli" trong Cài đặt.',
      );
    },
  };
}

/** Manual mode: shows the prompt for the user to paste into a chat tool. Paste-back flow comes later. */
export function createManualProvider(): AiProvider {
  return {
    name: "manual",
    paid: false,
    modelFor: () => "manual",
    async generateText(input) {
      const pendingPrompt = `${systemWithJson(input.system, input.json)}\n\n---\n\n${input.prompt}`;
      throw new AiError(
        "manual_pending",
        "Đang chờ dán kết quả (chế độ thủ công). Màn hình dán kết quả sẽ có ở phase sau.",
        { pendingPrompt },
      );
    },
  };
}
