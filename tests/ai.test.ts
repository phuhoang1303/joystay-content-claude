import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { AiError, generateText } from "@/lib/ai";
import { buildClaudeArgs, createClaudeCliProvider, parseCliOutput } from "@/lib/ai/claude-cli";
import { createFakeProvider } from "@/lib/ai/fake";
import { createAnthropicApiProvider, createManualProvider } from "@/lib/ai/stubs";
import { capStatus } from "@/lib/cost/cap";
import { aiUsage } from "@/lib/db/schema";
import { setSetting } from "@/lib/settings";
import { setupDb } from "./helpers";

const workDir = path.join(os.tmpdir(), "joystay-claude-cli-test");

/** Minimal fake ChildProcess driven by the test. */
function fakeSpawn(behaviour: {
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: NodeJS.ErrnoException;
  hang?: boolean;
}) {
  const seen: { command: string; args: string[]; stdin: string; env?: NodeJS.ProcessEnv } = {
    command: "",
    args: [],
    stdin: "",
  };
  const spawn = (command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) => {
    seen.command = command;
    seen.args = args;
    seen.env = options.env;
    const child = new EventEmitter() as ChildProcess;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdin, stdout, stderr, kill: () => true });
    stdin.on("data", (d: Buffer) => (seen.stdin += d.toString("utf8")));
    setImmediate(() => {
      if (behaviour.error) return child.emit("error", behaviour.error);
      if (behaviour.hang) return;
      if (behaviour.stdout) stdout.write(behaviour.stdout);
      if (behaviour.stderr) stderr.write(behaviour.stderr);
      child.emit("close", behaviour.code ?? 0);
    });
    return child;
  };
  return { spawn, seen };
}

const okOutput = (result: string) =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    result,
    usage: { input_tokens: 2, cache_creation_input_tokens: 1000, output_tokens: 30 },
    modelUsage: { "claude-haiku-5-5": {} },
  });

describe("claude-cli provider", () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it("disables all tools and picks the model by tier", () => {
    const args = buildClaudeArgs("smart", "sys.txt");
    expect(args).toContain("-p");
    expect(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
    expect(args.slice(args.indexOf("--model"), args.indexOf("--model") + 2)).toEqual([
      "--model",
      "sonnet",
    ]);
    expect(args).toContain("--strict-mcp-config");
    expect(buildClaudeArgs("fast", "s")).toContain("haiku");
  });

  it("sends the prompt on stdin and parses text, model and tokens", async () => {
    process.env.ANTHROPIC_API_KEY = "should-not-leak";
    const { spawn, seen } = fakeSpawn({ stdout: okOutput("Xin chào!") });
    const p = createClaudeCliProvider({ spawn, workDir });
    const r = await p.generateText({ tier: "fast", system: "Hệ thống", prompt: "Chào nhé" });

    expect(seen.stdin).toBe("Chào nhé");
    expect(seen.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(r).toMatchObject({ text: "Xin chào!", provider: "claude-cli", model: "claude-haiku-5-5" });
    expect(r.usage).toMatchObject({ inputTokens: 1002, outputTokens: 30, costUsd: 0, isPaid: false });
  });

  it("validates JSON replies and strips code fences", async () => {
    const { spawn } = fakeSpawn({ stdout: okOutput('```json\n{"a":1}\n```') });
    const r = await createClaudeCliProvider({ spawn, workDir }).generateText({
      tier: "fast",
      system: "s",
      prompt: "p",
      json: true,
    });
    expect(JSON.parse(r.text)).toEqual({ a: 1 });

    const bad = fakeSpawn({ stdout: okOutput("không phải json") });
    await expect(
      createClaudeCliProvider({ spawn: bad.spawn, workDir }).generateText({
        tier: "fast",
        system: "s",
        prompt: "p",
        json: true,
      }),
    ).rejects.toMatchObject({ code: "bad_output" });
  });

  it("maps a missing executable to a non-retryable Vietnamese error", async () => {
    const err = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    const { spawn } = fakeSpawn({ error: err });
    const promise = createClaudeCliProvider({ spawn, workDir }).generateText({
      tier: "fast",
      system: "s",
      prompt: "p",
    });
    await expect(promise).rejects.toBeInstanceOf(AiError);
    await expect(promise).rejects.toMatchObject({ code: "not_installed", retryable: false });
    await expect(promise).rejects.toThrow(/Không tìm thấy lệnh "claude"/);
  });

  it("reports CLI errors and timeouts", async () => {
    const failing = fakeSpawn({ stdout: "", stderr: "not logged in", code: 1 });
    await expect(
      createClaudeCliProvider({ spawn: failing.spawn, workDir }).generateText({
        tier: "fast",
        system: "s",
        prompt: "p",
      }),
    ).rejects.toMatchObject({ code: "cli_error" });

    const hanging = fakeSpawn({ hang: true });
    await expect(
      createClaudeCliProvider({ spawn: hanging.spawn, workDir, timeoutMs: 20 }).generateText({
        tier: "fast",
        system: "s",
        prompt: "p",
      }),
    ).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("treats is_error results as CLI errors", () => {
    expect(() =>
      parseCliOutput(JSON.stringify({ subtype: "success", is_error: true, result: "rate limit" })),
    ).toThrow(/rate limit/);
  });
});

describe("stub providers", () => {
  it("anthropic-api is paid and not configured yet", async () => {
    const p = createAnthropicApiProvider();
    expect(p.paid).toBe(true);
    await expect(p.generateText({ tier: "fast", system: "s", prompt: "p" })).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  it("manual returns a waiting-for-paste state with the prompt", async () => {
    await expect(
      createManualProvider().generateText({ tier: "smart", system: "S", prompt: "P" }),
    ).rejects.toMatchObject({ code: "manual_pending", pendingPrompt: expect.stringContaining("P") });
  });
});

describe("generateText (logging + cap)", () => {
  it("writes one ai_usage row per successful call", async () => {
    const { db, workspaceId } = setupDb();
    const provider = createFakeProvider({ reply: "ok" });
    const r = await generateText(
      { db, workspaceId, step: "unit", provider, contentItemId: 7 },
      { tier: "smart", system: "abc", prompt: "de" },
    );
    const rows = db.select().from(aiUsage).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: r.usageId,
      step: "unit",
      provider: "fake",
      model: "fake-smart",
      inputChars: 5,
      outputChars: 2,
      ok: true,
      contentItemId: 7,
    });
  });

  it("logs failed calls too", async () => {
    const { db, workspaceId } = setupDb();
    const provider = createFakeProvider({ error: new Error("hỏng") });
    await expect(
      generateText({ db, workspaceId, step: "unit", provider }, { tier: "fast", system: "", prompt: "" }),
    ).rejects.toThrow("hỏng");
    expect(db.select().from(aiUsage).all()[0]).toMatchObject({ ok: false, error: "hỏng" });
  });

  it("warns at 80% and blocks paid calls at the cap", async () => {
    const { db, workspaceId } = setupDb();
    setSetting(db, "cost.monthlyPaidCapUsd", 1);
    const paid = createFakeProvider({ paid: true, costUsd: 0.85 });

    await generateText({ db, workspaceId, step: "unit", provider: paid }, { tier: "fast", system: "", prompt: "" });
    expect(capStatus(db).level).toBe("warn");

    await generateText({ db, workspaceId, step: "unit", provider: paid }, { tier: "fast", system: "", prompt: "" });
    expect(capStatus(db).level).toBe("blocked");

    await expect(
      generateText({ db, workspaceId, step: "unit", provider: paid }, { tier: "fast", system: "", prompt: "" }),
    ).rejects.toMatchObject({ code: "cap_reached" });
    expect(paid.calls).toHaveLength(2);

    // Free providers are never blocked by the paid cap.
    const free = createFakeProvider();
    await expect(
      generateText({ db, workspaceId, step: "unit", provider: free }, { tier: "fast", system: "", prompt: "" }),
    ).resolves.toBeTruthy();
  });
});
