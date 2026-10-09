import { randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const projectRoot = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);

export function localEnvironment({ ensure = false } = {}) {
  const filename = path.join(projectRoot, ".env");
  if (ensure && !existsSync(filename))
    writeFileSync(
      filename,
      readFileSync(path.join(projectRoot, ".env.example")),
      { mode: 0o600 },
    );
  let saved = existsSync(filename)
    ? parseEnv(readFileSync(filename, "utf8"))
    : {};
  if (ensure) {
    const defaults = {
      TWIN_WORKER_URL: "http://127.0.0.1:8787",
      TWIN_WORKER_SECRET: randomBytes(32).toString("base64url"),
      TWIN_DATA_DIR: path.join(projectRoot, "services/market-twin/.data"),
      TWIN_CHROME_CHANNEL: existsSync("/Applications/Google Chrome.app")
        ? "chrome"
        : "",
    };
    const additions = Object.entries(defaults).filter(
      ([key]) => !saved[key] && !process.env[key],
    );
    if (additions.length) {
      appendFileSync(
        filename,
        `\n# Market Twin local worker. Server only.\n${additions.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n")}\n`,
        { mode: 0o600 },
      );
      saved = parseEnv(readFileSync(filename, "utf8"));
    }
  }
  return { ...saved, ...process.env };
}
