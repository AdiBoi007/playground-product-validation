import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import {
  expectMethod,
  failure,
  HttpError,
  json,
  objectBody,
  stringField,
} from "./_lib/http.js";
import {
  authenticate,
  database,
  memberWorkspace,
  serverId,
} from "./_lib/server.js";

export const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;
const fileTypes: Record<
  string,
  { extension: string; valid: (bytes: Buffer) => boolean }
> = {
  "image/png": {
    extension: "png",
    valid: (bytes) =>
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  "image/jpeg": {
    extension: "jpg",
    valid: (bytes) => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
  },
  "image/webp": {
    extension: "webp",
    valid: (bytes) =>
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP",
  },
  "image/gif": {
    extension: "gif",
    valid: (bytes) =>
      ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)),
  },
};
export function decodeEvidence(contentType: string, base64: string) {
  const type = Object.prototype.hasOwnProperty.call(fileTypes, contentType)
    ? fileTypes[contentType]
    : undefined;
  if (!type)
    throw new HttpError(
      400,
      "Upload a PNG, JPEG, WebP or GIF screenshot. Add recordings as links.",
    );
  if (
    !base64 ||
    base64.length > Math.ceil(MAX_EVIDENCE_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
    base64.length % 4 !== 0
  ) {
    throw new HttpError(413, "Upload a valid screenshot smaller than 3 MB.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > MAX_EVIDENCE_BYTES || !type.valid(bytes))
    throw new HttpError(400, "The screenshot does not match its file type.");
  return { bytes, extension: type.extension };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    expectMethod(req, "POST");
    const user = await authenticate(req);
    const { data, profile } = await memberWorkspace(user);
    const body = objectBody(req);
    const assignmentId = stringField(body, "assignmentId", 100);
    const assignment = data.assignments.find(
      (item) => item.id === assignmentId && item.testerId === profile.id,
    );
    if (
      profile.role !== "tester" ||
      !assignment ||
      !["accepted", "revision"].includes(assignment.status)
    )
      throw new HttpError(
        403,
        "Accept your assignment before uploading evidence.",
      );
    const name = stringField(body, "name", 200);
    const contentType = stringField(body, "contentType", 50);
    const encoded = stringField(body, "base64", 4_194_304);
    const { bytes, extension } = decodeEvidence(contentType, encoded);
    const path = `${assignmentId}/${serverId()}.${extension}`;
    const { error } = await database()
      .storage.from("evidence")
      .upload(path, bytes, {
        contentType,
        upsert: false,
        cacheControl: "3600",
      });
    if (error)
      throw new HttpError(
        503,
        "The screenshot could not be uploaded. Please try again.",
      );
    const { data: signed, error: signError } = await database()
      .storage.from("evidence")
      .createSignedUrl(path, 3600);
    if (signError || !signed)
      throw new HttpError(503, "The screenshot link could not be created.");
    return json(
      res,
      { id: `storage:${path}`, name, kind: "image", url: signed.signedUrl },
      201,
    );
  } catch (error) {
    return failure(res, error);
  }
}
