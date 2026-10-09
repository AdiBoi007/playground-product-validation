import { randomUUID } from "node:crypto";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { ApiRequest } from "./http.js";
import { emptyData, publicData } from "../../src/mvp/model.js";
import type {
  CommandResult,
  Profile,
  WorkspaceData,
} from "../../src/mvp/types.js";
import { HttpError } from "./http.js";

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value)
    throw new HttpError(503, `Server setup is incomplete: ${name} is missing.`);
  return value;
}

let db: SupabaseClient | undefined;
export function database() {
  db ??= createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return db;
}

export async function authenticate(req: ApiRequest): Promise<User> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    throw new HttpError(401, "Sign in to continue.");
  const token = header.slice(7).trim();
  if (!token || token.length > 8192)
    throw new HttpError(401, "Invalid session.");
  const { data, error } = await database().auth.getUser(token);
  if (error || !data.user?.email || !data.user.email_confirmed_at) {
    throw new HttpError(401, "Your session has expired. Sign in again.");
  }
  return data.user;
}

export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

export function reconcileProfile(data: WorkspaceData, user: User): Profile {
  const email = user.email!.toLowerCase();
  const existing = data.profiles.find((profile) => profile.id === user.id);
  const allowedAdmin = isAdminEmail(email);
  if (existing) {
    existing.email = email;
    // The client can edit auth metadata. It cannot change an established role or grant admin.
    existing.role = allowedAdmin
      ? "admin"
      : existing.role === "admin"
        ? "founder"
        : existing.role;
    return existing;
  }
  const metadata = user.user_metadata ?? {};
  const profile: Profile = {
    id: user.id,
    email,
    name:
      typeof metadata.name === "string" && metadata.name.trim()
        ? metadata.name.trim().slice(0, 100)
        : email.split("@")[0],
    role: allowedAdmin
      ? "admin"
      : metadata.role === "tester"
        ? "tester"
        : "founder",
    expertise: [],
    device: "desktop",
    availability: "available",
    bio: "",
    createdAt: user.created_at || new Date().toISOString(),
  };
  data.profiles.push(profile);
  return profile;
}

export async function readWorkspace(): Promise<{
  data: WorkspaceData;
  revision: number;
}> {
  const { data, error } = await database()
    .from("playground_workspace")
    .select("data, revision")
    .eq("id", "global")
    .single();
  if (error || !data)
    throw new HttpError(
      503,
      "Apply the Supabase migration before using the connected workspace.",
    );
  return {
    data: structuredClone(data.data ?? emptyData()) as WorkspaceData,
    revision: Number(data.revision),
  };
}

/** The entire command and profile registration commit together. CAS retries avoid lost invitations / feedback. */
export async function mutateWorkspace(
  user: User | null,
  mutation: (data: WorkspaceData, actor: Profile | null) => CommandResult,
): Promise<{ result: CommandResult; profile: Profile | null }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const snapshot = await readWorkspace();
    const profile = user ? reconcileProfile(snapshot.data, user) : null;
    const result = mutation(snapshot.data, profile);
    const { data: committed, error } = await database().rpc(
      "playground_compare_and_swap",
      {
        expected_revision: snapshot.revision,
        next_data: result.data,
      },
    );
    if (error?.message === "Checkout mission is locked")
      throw new HttpError(
        409,
        "This mission is reserved for an open checkout. Cancel checkout before editing it.",
      );
    if (error)
      throw new HttpError(
        503,
        "The workspace could not be saved. Please try again.",
      );
    if (committed === true)
      return {
        result,
        profile: profile
          ? (result.data.profiles.find((item) => item.id === profile.id) ??
            profile)
          : null,
      };
  }
  throw new HttpError(
    409,
    "The workspace changed while saving. Refresh and try again.",
  );
}

export async function memberWorkspace(user: User) {
  const { result, profile } = await mutateWorkspace(user, (data) => ({ data }));
  return { data: result.data, profile: profile! };
}

export async function visibleWorkspace(data: WorkspaceData, actor: Profile) {
  const visible = structuredClone(publicData(data, actor));
  // Private objects receive fresh expiring URLs only after the domain visibility filter.
  const paths = new Set<string>(
    visible.submissions.flatMap((submission) =>
      submission.results.flatMap((result) =>
        result.evidence
          .filter((asset) => asset.id.startsWith("storage:"))
          .map((asset) => asset.id.slice(8)),
      ),
    ),
  );
  if (paths.size) {
    const { data: signed, error } = await database()
      .storage.from("evidence")
      .createSignedUrls([...paths], 3600);
    if (error)
      throw new HttpError(
        503,
        "Evidence links could not be refreshed. Please try again.",
      );
    const links = new Map(
      (signed ?? []).map((item) => [item.path, item.signedUrl]),
    );
    for (const submission of visible.submissions) {
      for (const result of submission.results)
        for (const asset of result.evidence) {
          if (asset.id.startsWith("storage:"))
            asset.url = links.get(asset.id.slice(8)) ?? "";
        }
    }
  }
  return visible;
}

export function serverId() {
  return randomUUID();
}
