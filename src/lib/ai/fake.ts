import { AiError, ensureJsonText, type AiProvider, type GenerateTextInput, type Tier } from "./types";

export type FakeProviderOptions = {
  /** Reply text, or a function of the input. */
  reply?: string | ((input: GenerateTextInput) => string);
  /** Throw this instead of replying. */
  error?: AiError | Error;
  paid?: boolean;
  costUsd?: number;
};

/** Deterministic provider for tests. Records every call. */
export function createFakeProvider(opts: FakeProviderOptions = {}) {
  const calls: GenerateTextInput[] = [];
  const provider: AiProvider & { calls: GenerateTextInput[] } = {
    name: "fake",
    paid: opts.paid ?? false,
    calls,
    modelFor: (tier: Tier) => `fake-${tier}`,
    async generateText(input) {
      calls.push(input);
      if (opts.error) throw opts.error;
      const raw =
        typeof opts.reply === "function" ? opts.reply(input) : (opts.reply ?? "Xin chào từ fake");
      const text = input.json ? ensureJsonText(raw) : raw;
      return {
        text,
        provider: "fake",
        model: `fake-${input.tier}`,
        usage: {
          inputChars: input.system.length + input.prompt.length,
          outputChars: text.length,
          inputTokens: null,
          outputTokens: null,
          costUsd: opts.costUsd ?? 0,
          isPaid: opts.paid ?? false,
        },
      };
    },
  };
  return provider;
}
