import { authHeaders } from "./auth-client";
import type {
  Command,
  CommandResult,
  EvidenceAsset,
  Profile,
  WorkspaceData,
} from "./types";

export class WorkspaceRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function connectedRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(await authHeaders()),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    });
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new WorkspaceRequestError(
        response.status,
        "The server response could not be read. Please try again.",
      );
    }
    if (!response.ok)
      throw new WorkspaceRequestError(
        response.status,
        result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
          ? result.error
          : "The request could not be completed. Please try again.",
      );
    return result as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "The server took too long to respond. Refresh and try again.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function workspaceData(value: unknown): WorkspaceData {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    ![
      "profiles",
      "campaigns",
      "assignments",
      "submissions",
      "reports",
      "payouts",
    ].every(
      (key) =>
        key in value && Array.isArray((value as Record<string, unknown>)[key]),
    )
  )
    throw new Error("The connected workspace could not be read.");
  return value as WorkspaceData;
}
export async function loadConnectedWorkspace(): Promise<{
  data: WorkspaceData;
  profile: Profile;
}> {
  const result = await connectedRequest<{ data: unknown; profile: Profile }>(
    "/api/workspace",
  );
  if (
    !result.profile?.id ||
    !["founder", "tester", "admin"].includes(result.profile.role)
  )
    throw new Error("The signed-in profile could not be read.");
  return { data: workspaceData(result.data), profile: result.profile };
}
export async function commandConnectedWorkspace(
  command: Command,
): Promise<CommandResult> {
  const result = await connectedRequest<CommandResult>("/api/workspace", {
    command,
  });
  return { ...result, data: workspaceData(result.data) };
}
export async function uploadConnectedEvidence(
  file: File,
  assignmentId: string,
): Promise<EvidenceAsset> {
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () =>
      reject(new Error("The screenshot could not be read."));
    reader.readAsDataURL(file);
  });
  const asset = await connectedRequest<EvidenceAsset>("/api/evidence", {
    assignmentId,
    name: file.name,
    contentType: file.type,
    base64: encoded,
  });
  if (
    !asset.id?.startsWith("storage:") ||
    asset.kind !== "image" ||
    !asset.url?.startsWith("https://")
  )
    throw new Error("The uploaded screenshot could not be confirmed.");
  return asset;
}
