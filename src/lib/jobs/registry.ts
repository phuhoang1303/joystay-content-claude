import { AI_TEST_JOB, createAiTestHandler } from "./handlers/ai-test";
import { createResearchHandlers } from "./handlers/research";
import type { JobRegistry } from "./runner";

/** All job types the worker knows. Later phases add writing, images, publish. */
export function createRegistry(): JobRegistry {
  return {
    [AI_TEST_JOB]: createAiTestHandler(),
    ...createResearchHandlers(),
  };
}
