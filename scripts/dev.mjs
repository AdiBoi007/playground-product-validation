import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { localEnvironment, projectRoot } from "./local-env.mjs";

if (Number(process.versions.node.split(".")[0]) < 24)
  throw new Error("Market Twin requires Node.js 24 or newer.");
const env = localEnvironment({ ensure: true });
const workerRoot = path.join(projectRoot, "services/market-twin");
if (!existsSync(path.join(workerRoot, "node_modules/playwright/package.json")))
  throw new Error("Install the browser worker first: npm run worker:install");
const children = [];
let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 6000);
  force.unref();
  Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) =>
          child.exitCode !== null ? resolve() : child.once("exit", resolve),
        ),
    ),
  ).then(() => process.exit(code));
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => shutdown());
const worker = spawn(process.execPath, ["src/server.mjs"], {
  cwd: workerRoot,
  env,
  stdio: "inherit",
});
children.push(worker);
worker.on("error", (error) => {
  console.error(error.message);
  shutdown(1);
});
worker.on("exit", (code) => {
  if (!closing) shutdown(code || 1);
});
let ready = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(`${env.TWIN_WORKER_URL}/health`, {
      headers: { Authorization: `Bearer ${env.TWIN_WORKER_SECRET}` },
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok && (await response.json()).configured) {
      ready = true;
      break;
    }
  } catch {
    /* A worker is still initializing its store. */
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!ready) {
  console.error(
    "The browser worker did not become ready. Check its startup error above.",
  );
  shutdown(1);
} else {
  const ui = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      ...process.argv.slice(2),
    ],
    { cwd: projectRoot, env, stdio: "inherit" },
  );
  children.push(ui);
  ui.on("error", (error) => {
    console.error(error.message);
    shutdown(1);
  });
  ui.on("exit", (code) => {
    if (!closing) shutdown(code || 0);
  });
}
