import { AI_TEST_JOB, createAiTestHandler } from "./handlers/ai-test";
import type { JobRegistry } from "./runner";

/** All job types the worker knows. Later phases add research, writing, images, publish. */
export function createRegistry(): JobRegistry {
  return {
    [AI_TEST_JOB]: createAiTestHandler(),
  };
}
