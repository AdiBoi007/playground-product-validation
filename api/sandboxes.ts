import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import {
  failure,
  HttpError,
  json,
  objectBody,
  rawBody,
  stringField,
} from "./_lib/http.js";
import { authenticate, database } from "./_lib/server.js";
import { assertSandboxOrigin } from "./sandbox.js";
import { validateSandbox } from "../src/mvp/sandbox.js";
import { prepareSandboxSave } from "../src/mvp/sandbox-persistence.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (!["GET", "POST"].includes(req.method || ""))
      throw new HttpError(405, "Use GET or POST.");
    const owner = await authenticate(req);
    if (req.method === "GET") {
      const { data, error } = await database()
        .from("playground_sandboxes")
        .select("document")
        .eq("founder_id", owner.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error)
        throw new HttpError(
          503,
          "Saved sandboxes could not be loaded. Apply the Sandbox migration.",
        );
      return json(res, {
        sandboxes: (data || []).map((row) => validateSandbox(row.document)),
      });
    }
    assertSandboxOrigin(req);
    if (
      !String(req.headers["content-type"] || "").startsWith("application/json")
    )
      throw new HttpError(415, "Send the sandbox as JSON.");
    if (req.body === undefined)
      req.body = (await rawBody(req, 12_000_000)).toString("utf8");
    if (
      Buffer.byteLength(
        typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      ) > 12_000_000
    )
      throw new HttpError(413, "The saved sandbox is too large.");
    const body = objectBody(req);
    if (body.action === "delete") {
      const id = stringField(body, "id", 200);
      const { error } = await database()
        .from("playground_sandboxes")
        .delete()
        .eq("id", id)
        .eq("founder_id", owner.id);
      if (error) throw new HttpError(503, "The sandbox could not be deleted.");
      return json(res, { deleted: true });
    }
    if (body.action !== "save")
      throw new HttpError(400, "Choose save or delete.");
    let sandbox;
    try {
      sandbox = validateSandbox(body.sandbox);
    } catch (error) {
      throw new HttpError(
        422,
        error instanceof Error ? error.message : "Invalid sandbox.",
      );
    }
    if (sandbox.founderId !== owner.id)
      throw new HttpError(403, "This sandbox belongs to another account.");
    const { data: existing, error: readError } = await database()
      .from("playground_sandboxes")
      .select("founder_id,document")
      .eq("id", sandbox.id)
      .maybeSingle();
    if (readError)
      throw new HttpError(503, "The saved sandbox could not be checked.");
    if (existing && existing.founder_id !== owner.id)
      throw new HttpError(403, "This sandbox belongs to another account.");
    let saved;
    try {
      saved = prepareSandboxSave(
        sandbox,
        existing ? validateSandbox(existing.document) : undefined,
      );
    } catch (error) {
      throw new HttpError(
        409,
        error instanceof Error
          ? error.message
          : "The sandbox changed. Reload before saving.",
      );
    }
    const { data: committed, error } = await database().rpc(
      "playground_save_sandbox",
      {
        requested_id: sandbox.id,
        requested_founder: owner.id,
        expected_updated: existing ? sandbox.updatedAt : null,
        next_document: saved,
      },
    );
    if (error)
      throw new HttpError(
        503,
        "The sandbox could not be saved. Apply the Sandbox migration.",
      );
    if (committed !== true)
      throw new HttpError(
        409,
        "This sandbox changed in another tab. Reload before saving.",
      );
    return json(res, { sandbox: saved });
  } catch (error) {
    return failure(res, error);
  }
}
