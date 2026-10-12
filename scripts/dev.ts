/**
 * npm run dev: the API with --watch on :8787 and Vite with hot reload on :5173.
 * Two processes, one terminal, no extra dependency.
 */
import { type ChildProcess, spawn } from "node:child_process";

const children: ChildProcess[] = [];

function start(name: string, command: string, args: string[], env: Record<string, string> = {}) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  const prefix = `[${name}] `;
  const forward = (stream: NodeJS.ReadableStream, out: NodeJS.WriteStream) =>
    stream.on("data", (data: Buffer) => {
      for (const line of data.toString().split(/\r?\n/)) if (line) out.write(`${prefix}${line}\n`);
    });
  if (child.stdout) forward(child.stdout, process.stdout);
  if (child.stderr) forward(child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.log(`${prefix}exited with ${code}`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  for (const child of children) if (!child.killed) child.kill();
  process.exit();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// process.execPath instead of "node"/"npx": no shell needed, same on Windows and Unix.
start("api", process.execPath, ["--watch", "--env-file-if-exists=.env", "src/server/index.ts"], {
  PORT: "8787",
  STATIC_DIR: "dist/__none__",
});
start("web", process.execPath, ["node_modules/vite/bin/vite.js"]);
