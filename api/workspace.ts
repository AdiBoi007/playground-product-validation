import type { ApiRequest, ApiResponse } from "./_lib/http.js";
import { parseCommand } from "./_lib/commands.js";
import { domainCommand } from "./_lib/domain.js";
import { failure, HttpError, json, objectBody } from "./_lib/http.js";
import {
  authenticate,
  database,
  memberWorkspace,
  mutateWorkspace,
  visibleWorkspace,
} from "./_lib/server.js";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (!["GET", "POST"].includes(req.method ?? ""))
      throw new HttpError(405, "Use GET or POST.");
    const user = await authenticate(req);
    if (req.method === "GET") {
      const { data, profile } = await memberWorkspace(user);
      return json(res, {
        data: await visibleWorkspace(data, profile),
        profile,
      });
    }
    const body = objectBody(req);
    if (JSON.stringify(body).length > 250_000)
      throw new HttpError(413, "The action is too large.");
    const command = parseCommand(body.command);
    if (command.type === "submit-feedback") {
      const { data: current, profile: actor } = await memberWorkspace(user);
      if (
        actor.role !== "tester" ||
        !current.assignments.some(
          (assignment) =>
            assignment.id === command.assignmentId &&
            assignment.testerId === actor.id &&
            ["accepted", "revision"].includes(assignment.status),
        )
      ) {
        throw new HttpError(
          403,
          "Only the assigned tester may submit evidence.",
        );
      }
      for (const result of command.results)
        for (const asset of result.evidence) {
          if (!asset.id.startsWith("storage:")) continue;
          const path = asset.id.slice(8);
          const parts = path.split("/");
          if (
            parts.length !== 2 ||
            parts[0] !== command.assignmentId ||
            !/^[\da-f-]{36}\.(png|jpg|webp|gif)$/.test(parts[1])
          ) {
            throw new HttpError(
              403,
              "Evidence must belong to your assignment.",
            );
          }
          const { data: objects, error } = await database()
            .storage.from("evidence")
            .list(parts[0], { search: parts[1], limit: 1 });
          if (error || !objects?.some((object) => object.name === parts[1]))
            throw new HttpError(
              400,
              "Upload this screenshot before submitting it.",
            );
          // Persist server URLs; the caller cannot substitute a different URL for an uploaded asset.
          const { data: signed, error: signError } = await database()
            .storage.from("evidence")
            .createSignedUrl(path, 3600);
          if (signError || !signed)
            throw new HttpError(503, "Evidence could not be signed.");
          asset.url = signed.signedUrl;
          asset.kind = "image";
        }
    }
    const { result, profile } = await mutateWorkspace(user, (data, actor) =>
      domainCommand(data, actor!, command),
    );
    return json(res, {
      ...result,
      data: await visibleWorkspace(result.data, profile!),
    });
  } catch (error) {
    return failure(res, error);
  }
}
