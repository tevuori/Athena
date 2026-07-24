// ===== Code execution sandbox (Docker-isolated) =====
// Runs Python / JavaScript snippets in a throwaway Docker container with
// no network, read-only filesystem, dropped capabilities, and hard limits.
//
// Requires the `docker` CLI on the host (or Docker socket mounted into the
// server container). Disabled automatically when docker is missing or when
// SANDBOX_ENABLED=false.
//
// Env vars:
//   SANDBOX_ENABLED       — "true" | "false" (default: auto-detect docker)
//   SANDBOX_TIMEOUT_MS    — hard timeout per run (default 10000)
//   SANDBOX_MAX_CODE_CHARS — max code size (default 20000)
//   SANDBOX_PYTHON_IMAGE  — docker image for python (default python:3.12-slim)
//   SANDBOX_NODE_IMAGE    — docker image for js/ts (default node:22-slim)
//   SANDBOX_DOCKER_RUNTIME — docker runtime for sandbox containers (e.g. "runsc"
//                            for gVisor). When set, adds --runtime=<value> to
//                            docker run. Recommended for public deployments.
//   SANDBOX_HOST_TMP      — temp dir for code files, must be visible from both
//                            the host and the server container when the Docker
//                            socket is mounted (Docker-in-Docker). Defaults to
//                            /tmp (fine for local dev; set to a bind-mounted
//                            shared dir for containerized deployments).

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type SandboxLanguage = "python" | "javascript" | "typescript";

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  language: SandboxLanguage;
  /** True if the sandbox backend is unavailable (docker missing/disabled). */
  unavailable?: boolean;
  error?: string;
}

const TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS ?? 10_000);
const MAX_CODE_CHARS = Number(process.env.SANDBOX_MAX_CODE_CHARS ?? 20_000);
const PYTHON_IMAGE = process.env.SANDBOX_PYTHON_IMAGE ?? "python:3.12-slim";
const NODE_IMAGE = process.env.SANDBOX_NODE_IMAGE ?? "node:22-slim";
const DOCKER_RUNTIME = process.env.SANDBOX_DOCKER_RUNTIME ?? ""; // e.g. "runsc"
const MAX_OUTPUT_BYTES = 50 * 1024; // 50 KB per stream
// When running inside a Docker container (Docker socket mounted from host),
// temp files must be written to a path that exists on BOTH the host and this
// container. SANDBOX_HOST_TMP should be a directory bind-mounted at the same
// path in both (see docker-compose.yml). Defaults to /tmp for local dev where
// the server runs directly on the host.
const HOST_TMP = process.env.SANDBOX_HOST_TMP ?? "/tmp";

let dockerChecked: boolean | null = null;

/** Check whether the docker CLI is available and daemon is reachable. */
async function dockerAvailable(): Promise<boolean> {
  if (process.env.SANDBOX_ENABLED === "false") return false;
  if (dockerChecked !== null) return dockerChecked;
  try {
    const res = await runCmd("docker", ["info", "--format", "{{.ServerVersion}}"], 5_000);
    dockerChecked = res.exitCode === 0 && res.stdout.trim().length > 0;
  } catch {
    dockerChecked = false;
  }
  return dockerChecked;
}

function runCmd(
  cmd: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += d.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: killed ? -1 : (code ?? -1) });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: -1 });
    });
  });
}

/** Ensure the required image is present (pull on first use). */
async function ensureImage(image: string): Promise<void> {
  // Check if image exists locally.
  const inspect = await runCmd("docker", ["image", "inspect", image], 10_000);
  if (inspect.exitCode === 0) return;
  // Pull (may take a while on first run).
  await runCmd("docker", ["pull", image], 120_000);
}

function langConfig(lang: SandboxLanguage): {
  image: string;
  filename: string;
  /** Command to run inside the container. */
  command: string[];
} {
  switch (lang) {
    case "python":
      return { image: PYTHON_IMAGE, filename: "main.py", command: ["python", "/tmp/main.py"] };
    case "javascript":
      return { image: NODE_IMAGE, filename: "main.js", command: ["node", "/tmp/main.js"] };
    case "typescript":
      // node:22-slim doesn't ship tsx; transpile with esbuild (npx) at runtime.
      // Simpler: use bun if available in the image — but node:slim has no bun.
      // We use `npx tsx` which downloads on first run (network=none blocks this).
      // Instead, strip types with a tiny regex-free approach: run via `node --experimental-strip-types`.
      // Node 22.6+ supports --experimental-strip-types for .ts files.
      return {
        image: NODE_IMAGE,
        filename: "main.ts",
        command: ["node", "--experimental-strip-types", "/tmp/main.ts"],
      };
  }
}

/**
 * Run a code snippet in an isolated Docker container.
 * @param language  python | javascript | typescript
 * @param code      The source code
 * @param stdin     Optional stdin to pipe in
 */
export async function runCode(
  language: SandboxLanguage,
  code: string,
  stdin?: string
): Promise<SandboxResult> {
  const start = Date.now();

  if (code.length > MAX_CODE_CHARS) {
    return {
      stdout: "",
      stderr: `Code too large (${code.length} chars, max ${MAX_CODE_CHARS}).`,
      exitCode: -1,
      durationMs: Date.now() - start,
      timedOut: false,
      language,
      error: "code_too_large",
    };
  }

  if (!(await dockerAvailable())) {
    return {
      stdout: "",
      stderr:
        "Code sandbox is unavailable (Docker not installed or SANDBOX_ENABLED=false). " +
        "Install Docker and set SANDBOX_ENABLED=true to enable code execution.",
      exitCode: -1,
      durationMs: Date.now() - start,
      timedOut: false,
      language,
      unavailable: true,
      error: "sandbox_unavailable",
    };
  }

  const { image, filename, command } = langConfig(language);

  try {
    await ensureImage(image);
  } catch (e) {
    return {
      stdout: "",
      stderr: `Failed to pull sandbox image '${image}': ${e instanceof Error ? e.message : "unknown"}`,
      exitCode: -1,
      durationMs: Date.now() - start,
      timedOut: false,
      language,
      error: "image_pull_failed",
    };
  }

  // Write code to a temp file on the host, mount it read-only into the container.
  let tmpDir: string | null = null;
  try {
    tmpDir = await mkdtemp(path.join(HOST_TMP, "athena-sandbox-"));
    const filePath = path.join(tmpDir, filename);
    await writeFile(filePath, code, "utf-8");

    const dockerArgs = [
      "run",
      "--rm",
      "--network=none",
      "--memory=256m",
      "--cpus=1",
      "--pids-limit=64",
      "--read-only",
      "--tmpfs=/tmp:rw,noexec,nosuid,size=16m",
      "--security-opt=no-new-privileges",
      "--cap-drop=ALL",
      "--user=65534:65534",
      "--workdir=/tmp",
      "--name", `athena-sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...(DOCKER_RUNTIME ? ["--runtime", DOCKER_RUNTIME] : []),
      "-v", `${filePath}:/tmp/${filename}:ro`,
      image,
      ...command,
    ];

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }>(
      (resolve) => {
        const child = spawn("docker", dockerArgs, { stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;

        const timer = setTimeout(() => {
          timedOut = true;
          // Kill the container (docker run --rm will clean up).
          child.kill("SIGKILL");
          // Also try to force-remove the container in case SIGKILL to `docker run`
          // doesn't propagate. The container name is unique so this is safe.
          const name = dockerArgs[dockerArgs.indexOf("--name") + 1];
          spawn("docker", ["rm", "-f", name], { stdio: "ignore" });
        }, TIMEOUT_MS);

        if (stdin && child.stdin) {
          child.stdin.write(stdin);
          child.stdin.end();
        } else {
          child.stdin?.end();
        }

        child.stdout.on("data", (d) => {
          if (stdout.length < MAX_OUTPUT_BYTES) stdout += d.toString();
        });
        child.stderr.on("data", (d) => {
          if (stderr.length < MAX_OUTPUT_BYTES) stderr += d.toString();
        });

        const done = (exitCode: number) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: timedOut ? -1 : exitCode, timedOut });
        };

        child.on("close", (code) => done(code ?? -1));
        child.on("error", () => done(-1));
      }
    );

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: Date.now() - start,
      timedOut: result.timedOut,
      language,
    };
  } catch (e) {
    return {
      stdout: "",
      stderr: `Sandbox error: ${e instanceof Error ? e.message : "unknown"}`,
      exitCode: -1,
      durationMs: Date.now() - start,
      timedOut: false,
      language,
      error: "sandbox_error",
    };
  } finally {
    if (tmpDir) {
      try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
    }
  }
}

/** Whether the sandbox is enabled (for surfacing in tool descriptions / health). */
export function isSandboxEnabled(): boolean {
  return process.env.SANDBOX_ENABLED !== "false";
}
