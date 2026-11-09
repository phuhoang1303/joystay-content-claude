import { generateText, type AiProvider } from "../../ai";
import type { JobHandler } from "../runner";

export const AI_TEST_JOB = "ai_test";

export type AiTestResult = {
  reply: string;
  provider: string;
  model: string;
  usageId: number;
};

export const AI_TEST_SYSTEM =
  "Bạn là trợ lý nội dung của Joystay, một homestay ở Quận 3, TP.HCM. Viết tiếng Việt tự nhiên, ngắn gọn.";
export const AI_TEST_PROMPT =
  "Đây là bài kiểm tra kết nối. Hãy chào chủ Joystay bằng một câu tiếng Việt ngắn, tự nhiên.";

/** `provider` is injectable for tests; production uses the one chosen in Settings. */
export function createAiTestHandler(provider?: AiProvider): JobHandler {
  return async ({ db, job, signal }) => {
    const r = await generateText(
      { db, workspaceId: job.workspaceId, step: AI_TEST_JOB, jobId: job.id, provider, signal },
      { tier: "fast", system: AI_TEST_SYSTEM, prompt: AI_TEST_PROMPT },
    );
    const result: AiTestResult = {
      reply: r.text.trim(),
      provider: r.provider,
      model: r.model,
      usageId: r.usageId,
    };
    return result;
  };
}
