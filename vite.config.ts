import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import research from "./api/research";
import sandbox from "./api/sandbox";
import experiments from "./api/experiments";
import validationFindings from "./api/validation-findings";
import twin from "./api/twin";
import sandboxes from "./api/sandboxes";
import workspace from "./api/workspace";
import checkout from "./api/checkout";
import webhook from "./api/webhook";
import evidence from "./api/evidence";
import mission from "./api/mission";
import synthesis from "./api/synthesis";
import { HttpError, rawBody } from "./api/_lib/http";
import type { ApiRequest, ApiResponse } from "./api/_lib/http";

function workspaceApi(): Plugin {
  const middleware = (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    const path = req.url?.split("?")[0];
    const handlers: Record<
      string,
      (req: ApiRequest, res: ApiResponse) => Promise<unknown>
    > = {
      "/api/research": research,
      "/api/sandbox": sandbox,
      "/api/experiments": experiments,
      "/api/validation-findings": validationFindings,
      "/api/twin": twin,
      "/api/sandboxes": sandboxes,
      "/api/workspace": workspace,
      "/api/checkout": checkout,
      "/api/webhook": webhook,
      "/api/evidence": evidence,
      "/api/mission": mission,
      "/api/synthesis": synthesis,
    };
    const handler = path ? handlers[path] : undefined;
    if (!handler) return next();
    const response = res as ApiResponse;
    response.status = (code) => {
      response.statusCode = code;
      return response;
    };
    response.json = (value) => {
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify(value));
      return response;
    };
    void (async () => {
      try {
        // The Vercel runtime parses JSON; local dev must do the same for retained APIs.
        // Webhook verification always receives the original unparsed bytes.
        if (
          req.method === "POST" &&
          [
            "/api/workspace",
            "/api/checkout",
            "/api/evidence",
            "/api/mission",
            "/api/synthesis",
          ].includes(path || "")
        ) {
          if (
            !String(req.headers["content-type"] || "").startsWith(
              "application/json",
            )
          )
            throw new HttpError(415, "Send this request as JSON.");
          (req as ApiRequest).body = (
            await rawBody(
              req as ApiRequest,
              path === "/api/evidence" ? 4_500_000 : 1_000_000,
            )
          ).toString("utf8");
        }
        await handler(req as ApiRequest, response);
      } catch (error) {
        if (error instanceof HttpError) {
          response.status(error.status).json({ error: error.message });
        } else next(error);
      }
    })();
  };
  return {
    name: "playground-workspace-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "SANDBOX_MODEL",
    "TWIN_WORKER_URL",
    "TWIN_WORKER_SECRET",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_EMAILS",
    "APP_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "AI_DAILY_REQUEST_LIMIT",
    "AI_DAILY_USER_REQUEST_LIMIT",
  ]) {
    if (!process.env[key] && serverEnv[key]) process.env[key] = serverEnv[key];
  }
  return {
    plugins: [react(), workspaceApi()],
    server: { host: "0.0.0.0" },
    build: {
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks: {
            "react-core": ["react", "react-dom", "react-router-dom"],
          },
        },
      },
    },
  };
});
