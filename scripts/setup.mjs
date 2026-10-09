import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { localEnvironment, projectRoot } from "./local-env.mjs";

const env = localEnvironment({ ensure: true });
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
if (!existsSync(path.join(projectRoot, "services/market-twin/package.json")))
  throw new Error("Market Twin worker package is missing.");
if (
  !existsSync(
    path.join(
      projectRoot,
      "services/market-twin/node_modules/playwright/package.json",
    ),
  )
) {
  const install = spawnSync(npm, ["--prefix", "services/market-twin", "ci"], {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });
  if (install.status !== 0) process.exit(install.status || 1);
}
if (!env.TWIN_CHROME_CHANNEL) {
  const install = spawnSync(
    process.execPath,
    [
      "services/market-twin/node_modules/playwright/cli.js",
      "install",
      "chromium",
    ],
    { cwd: projectRoot, env, stdio: "inherit" },
  );
  if (install.status !== 0) process.exit(install.status || 1);
}
console.log(
  "Playground local worker is installed. Put account settings in the ignored .env file before connecting cloud services.",
);
