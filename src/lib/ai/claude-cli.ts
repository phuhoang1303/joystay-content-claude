import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AiError,
  ensureJsonText,
  systemWithJson,
  type AiProvider,
  type CallOptions,
  type GenerateTextInput,
  type GenerateTextResult,
  type Tier,
} from "./types";

type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export type ClaudeCliOptions = {
  /** Executable; defaults to CLAUDE_CLI_PATH env or "claude" on PATH. */
  command?: string;
  timeoutMs?: number;
  /** Injected in tests. */
  spawn?: SpawnFn;
  /** Working dir for the CLI: an empty folder so no project CLAUDE.md/settings leak in. */
  workDir?: string;
};

const MODEL_ALIAS: Record<Tier, string> = { fast: "haiku", smart: "sonnet" };

/** Env vars never passed to the CLI: an API key would switch it from the subscription to paid API billing. */
const STRIPPED_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];

/**
 * Exact command (prompt on stdin, system prompt in a temp file):
 *   claude -p --output-format json --model <haiku|sonnet> --tools "" --strict-mcp-config
 *          --disable-slash-commands --no-session-persistence --system-prompt-file <file>
 */
export function buildClaudeArgs(tier: Tier, systemPromptFile: string): string[] {
  return [
    "-p",
    "--output-format",
    "json",
    "--model",
    MODEL_ALIAS[tier],
    "--tools",
    "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--system-prompt-file",
    systemPromptFile,
  ];
}

type CliJson = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
};

export function parseCliOutput(stdout: string): {
  text: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
} {
  let data: CliJson;
  try {
    data = JSON.parse(stdout.trim()) as CliJson;
  } catch {
    throw new AiError("bad_output", "Claude CLI trả về dữ liệu không đọc được (không phải JSON).");
  }
  if (data.is_error || data.subtype !== "success" || typeof data.result !== "string") {
    const detail = typeof data.result === "string" ? `: ${data.result.slice(0, 300)}` : "";
    throw new AiError("cli_error", `Claude CLI báo lỗi${detail}`);
  }
  const u = data.usage ?? {};
  const inputTokens =
    u.input_tokens === undefined
      ? null
      : (u.input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0);
  const models = Object.keys(data.modelUsage ?? {});
  return {
    text: data.result,
    model: models[0] ?? null,
    inputTokens,
    outputTokens: u.output_tokens ?? null,
  };
}

export function createClaudeCliProvider(options: ClaudeCliOptions = {}): AiProvider {
  const spawn = options.spawn ?? (nodeSpawn as SpawnFn);
  const timeoutMs = options.timeoutMs ?? 180_000;

  return {
    name: "claude-cli",
    paid: false,
    modelFor: (tier) => MODEL_ALIAS[tier],

    async generateText(input: GenerateTextInput, opts?: CallOptions): Promise<GenerateTextResult> {
      const command = options.command ?? process.env.CLAUDE_CLI_PATH ?? "claude";
      const workDir = options.workDir ?? path.join(os.tmpdir(), "joystay-claude-cli");
      fs.mkdirSync(workDir, { recursive: true });
      const system = systemWithJson(input.system, input.json);
      const systemFile = path.join(workDir, `system-${randomUUID()}.txt`);
      fs.writeFileSync(systemFile, system, "utf8");

      const env = { ...process.env };
      for (const k of STRIPPED_ENV) delete env[k];

      try {
        const stdout = await runProcess({
          spawn,
          command,
          args: buildClaudeArgs(input.tier, systemFile),
          stdin: input.prompt,
          cwd: workDir,
          env,
          timeoutMs,
          signal: opts?.signal,
        });
        const parsed = parseCliOutput(stdout);
        const text = input.json ? ensureJsonText(parsed.text) : parsed.text;
        return {
          text,
          provider: "claude-cli",
          model: parsed.model ?? MODEL_ALIAS[input.tier],
          usage: {
            inputChars: system.length + input.prompt.length,
            outputChars: text.length,
            inputTokens: parsed.inputTokens,
            outputTokens: parsed.outputTokens,
            costUsd: 0, // covered by the owner's Claude subscription
            isPaid: false,
          },
        };
      } finally {
        fs.rmSync(systemFile, { force: true });
      }
    },
  };
}

function runProcess(p: {
  spawn: SpawnFn;
  command: string;
  args: string[];
  stdin: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      p.signal?.removeEventListener("abort", onAbort);
      fn();
    };

    let child: ChildProcess;
    try {
      child = p.spawn(p.command, p.args, {
        cwd: p.cwd,
        env: p.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      reject(mapSpawnError(err));
      return;
    }

    const out: Buffer[] = [];
    const errOut: Buffer[] = [];
    child.stdout?.on("data", (d: Buffer) => out.push(d));
    child.stderr?.on("data", (d: Buffer) => errOut.push(d));

    const timer = setTimeout(() => {
      child.kill();
      finish(() =>
        reject(
          new AiError(
            "timeout",
            `Claude không phản hồi sau ${Math.round(p.timeoutMs / 1000)} giây. Hãy thử lại.`,
          ),
        ),
      );
    }, p.timeoutMs);

    const onAbort = () => {
      child.kill();
      finish(() => reject(new AiError("aborted", "Lệnh gọi Claude đã bị dừng.")));
    };
    if (p.signal?.aborted) onAbort();
    else p.signal?.addEventListener("abort", onAbort);

    child.on("error", (err) => finish(() => reject(mapSpawnError(err))));
    child.on("close", (code) => {
      const stdout = Buffer.concat(out).toString("utf8");
      if (code === 0) return finish(() => resolve(stdout));
      // The CLI prints a JSON result with is_error even on some failures; prefer that message.
      finish(() => {
        try {
          parseCliOutput(stdout);
        } catch (e) {
          if (e instanceof AiError && e.code === "cli_error") return reject(e);
        }
        const stderr = Buffer.concat(errOut).toString("utf8").trim().slice(0, 300);
        reject(
          new AiError(
            "cli_error",
            `Claude CLI thoát với mã ${code}${stderr ? `: ${stderr}` : ""}. Kiểm tra bạn đã đăng nhập Claude Code chưa (chạy "claude" một lần trong terminal).`,
          ),
        );
      });
    });

    child.stdin?.on("error", () => {
      /* handled by close/error */
    });
    child.stdin?.end(p.stdin, "utf8");
  });
}

function mapSpawnError(err: unknown): AiError {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") {
    return new AiError(
      "not_installed",
      'Không tìm thấy lệnh "claude" trên máy. Hãy cài Claude Code CLI, đăng nhập (chạy "claude" một lần), rồi thử lại.',
    );
  }
  return new AiError(
    "cli_error",
    `Không chạy được Claude CLI (${code ?? "lỗi không rõ"}). Kiểm tra lại cài đặt Claude Code.`,
  );
}
