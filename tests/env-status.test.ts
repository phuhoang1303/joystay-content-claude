import { describe, expect, it } from "vitest";
import { getEnvStatus } from "@/features/settings/env-status";

describe("getEnvStatus", () => {
  it("reports presence only and never includes values", () => {
    const secret = "sk-canary-should-never-appear";
    const status = getEnvStatus({ TAVILY_API_KEY: secret, OPENAI_API_KEY: "  " } as NodeJS.ProcessEnv);

    expect(status.find((s) => s.key === "TAVILY_API_KEY")?.present).toBe(true);
    expect(status.find((s) => s.key === "OPENAI_API_KEY")?.present).toBe(false);
    expect(status.find((s) => s.key === "GEMINI_API_KEY")?.present).toBe(false);
    expect(JSON.stringify(status)).not.toContain(secret);
    for (const s of status) expect(Object.keys(s).sort()).toEqual(["key", "label", "phase", "present"]);
  });
});
