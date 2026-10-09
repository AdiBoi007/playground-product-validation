import { spawn } from "node:child_process";
import path from "node:path";
import { localEnvironment, projectRoot } from "./local-env.mjs";
const child = spawn(process.execPath, ["src/server.mjs"], {
  cwd: path.join(projectRoot, "services/market-twin"),
  env: localEnvironment({ ensure: true }),
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
