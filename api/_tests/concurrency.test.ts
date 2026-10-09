import type { User } from "@supabase/supabase-js";
import type { ApiRequest } from "../_lib/http.js";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyData } from "../../src/mvp/model.js";

const memory = vi.hoisted(() => ({
  revision: 0,
  data: null as unknown,
  getUser: vi.fn(),
  conflicts: 0,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: memory.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              revision: memory.revision,
              data: structuredClone(memory.data),
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (
      _name: string,
      args: { expected_revision: number; next_data: unknown },
    ) => {
      if (args.expected_revision !== memory.revision) {
        memory.conflicts++;
        return { data: false, error: null };
      }
      memory.data = structuredClone(args.next_data);
      memory.revision++;
      return { data: true, error: null };
    },
  }),
}));
import { authenticate, mutateWorkspace } from "../_lib/server.js";

beforeEach(() => {
  memory.data = emptyData();
  memory.revision = 0;
  memory.conflicts = 0;
  vi.stubEnv("SUPABASE_URL", "https://test-only.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-test-only");
  vi.stubEnv("ADMIN_EMAILS", "");
  memory.getUser.mockReset();
});
it("retries an atomic conflict and keeps both concurrently registered humans", async () => {
  const user = (id: string) =>
    ({
      id,
      email: `${id}@example.com`,
      user_metadata: { role: "tester", name: id },
      created_at: "2026-10-09T00:00:00Z",
      app_metadata: {},
      aud: "authenticated",
    }) as User;
  await Promise.all([
    mutateWorkspace(user("human-1"), (data) => ({ data })),
    mutateWorkspace(user("human-2"), (data) => ({ data })),
  ]);
  expect(memory.conflicts).toBeGreaterThan(0);
  expect(
    (memory.data as ReturnType<typeof emptyData>).profiles
      .map((profile) => profile.id)
      .sort(),
  ).toEqual(["human-1", "human-2"]);
});
it("checks the bearer token with Supabase and rejects unverified email identities", async () => {
  const req = {
    headers: { authorization: "Bearer real-access-token" },
  } as ApiRequest;
  memory.getUser.mockResolvedValue({
    data: {
      user: { id: "u", email: "u@example.com", email_confirmed_at: null },
    },
    error: null,
  });
  await expect(authenticate(req)).rejects.toThrow("session has expired");
  expect(memory.getUser).toHaveBeenCalledWith("real-access-token");
  memory.getUser.mockResolvedValue({
    data: {
      user: {
        id: "u",
        email: "u@example.com",
        email_confirmed_at: "2026-10-09",
      },
    },
    error: null,
  });
  expect((await authenticate(req)).id).toBe("u");
});
