import { applyCommand } from "../../src/mvp/model.js";
import type { Command, Profile, WorkspaceData } from "../../src/mvp/types.js";
import { HttpError } from "./http.js";
import { serverId } from "./server.js";

export function domainCommand(
  data: WorkspaceData,
  actor: Profile,
  command: Command,
) {
  try {
    return applyCommand(data, actor, command, { id: serverId });
  } catch (error) {
    throw new HttpError(
      422,
      error instanceof Error ? error.message : "This action is not permitted.",
    );
  }
}
