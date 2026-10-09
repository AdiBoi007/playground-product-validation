import { validateSandbox } from "./sandbox.js";
import type { Sandbox } from "./sandbox.js";

/** The same revision and source-history rules apply to device and cloud storage. */
export function prepareSandboxSave(
  sandbox: Sandbox,
  existing?: Sandbox,
  now = Date.now(),
): Sandbox {
  if (existing && sandbox.updatedAt !== existing.updatedAt)
    throw new Error(
      "This sandbox changed in another tab. Reload before saving.",
    );
  const archived = new Map(
    (existing?.sourceArchive || []).map((source) => [source.id, source]),
  );
  for (const source of sandbox.sourceArchive || []) {
    const old = archived.get(source.id);
    if (old && old.url !== source.url)
      throw new Error(
        "A source ID was reused for a different URL. Earlier citations have been kept.",
      );
    archived.set(source.id, source);
  }
  return validateSandbox({
    ...sandbox,
    sourceArchive: [...archived.values()],
    createdAt: existing?.createdAt || sandbox.createdAt,
    updatedAt: new Date(
      Math.max(now, existing ? Date.parse(existing.updatedAt) + 1 : now),
    ).toISOString(),
  });
}
