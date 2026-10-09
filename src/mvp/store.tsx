/* eslint-disable react-refresh/only-export-components -- Shared provider and its context hook stay together. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { applyCommand, emptyData, suggestMission } from "./model";
import { authClient, authIdentity, cloudConfigured } from "./auth-client";
import {
  commandConnectedWorkspace,
  connectedRequest,
  loadConnectedWorkspace,
  uploadConnectedEvidence,
} from "./connected-client";
import type {
  Command,
  CommandResult,
  EvidenceAsset,
  Profile,
  Role,
  StoreValue,
  WorkspaceData,
} from "./types";

const Context = createContext<StoreValue | null>(null);
const PROFILE_KEY = "playground-mvp-account";
const TESTER_KEY = "playground-mvp-tester-profile";
let database: Promise<IDBDatabase> | undefined;

function db() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("playground-mvp", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Device storage is unavailable. Allow site storage to save your work.",
        ),
      );
  });
  return database;
}
async function readLocal(): Promise<WorkspaceData> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("workspace")
      .objectStore("workspace")
      .get("data");
    request.onsuccess = () => {
      const value = request.result;
      if (!value) return resolve(emptyData());
      if (
        value.schemaVersion !== 1 ||
        ![
          "profiles",
          "campaigns",
          "assignments",
          "submissions",
          "reports",
          "payouts",
        ].every((key) => Array.isArray(value[key]))
      )
        return reject(
          new Error(
            "The saved workspace could not be read. Your browser data has been kept.",
          ),
        );
      resolve(value);
    };
    request.onerror = () =>
      reject(new Error("Could not load your saved workspace."));
  });
}
async function writeLocal(data: WorkspaceData): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("workspace", "readwrite");
    transaction.objectStore("workspace").put(data, "data");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        new Error(
          "Your browser could not save this change. Check available storage and try again.",
        ),
      );
    transaction.onabort = () =>
      reject(
        new Error("The workspace change could not be saved. Please try again."),
      );
  });
}
function newProfile(role: Role, name: string): Profile {
  return {
    id: crypto.randomUUID(),
    email: "",
    name,
    role,
    expertise: [],
    device: "desktop",
    availability: "available",
    bio: "",
    createdAt: new Date().toISOString(),
  };
}
function storedId(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function rememberId(key: string, id: string) {
  try {
    localStorage.setItem(key, id);
  } catch {
    /* IndexedDB still holds the workspace when preference storage is unavailable. */
  }
}
function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

export function MvpProvider({ children }: { children: ReactNode }) {
  const connected = cloudConfigured();
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [user, setUser] = useState<Profile | null>(null);
  const userRef = useRef<Profile | null>(null);
  const draftTester = useRef<Profile | null>(null);
  const mutationEpoch = useRef(0);
  const refreshSequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const channel = useRef<BroadcastChannel | null>(null);
  const alive = useRef(true);
  const cloudIdentity = useRef<string | null>(null);
  const authEpoch = useRef(0);
  const selectProfile = useCallback((profile: Profile) => {
    userRef.current = profile;
    if (alive.current) setUser(profile);
    if (profile.role === "tester") rememberId(TESTER_KEY, profile.id);
    rememberId(PROFILE_KEY, profile.id);
  }, []);
  const commit = useCallback(
    (next: WorkspaceData) => {
      if (alive.current) setData(next);
      const updated = next.profiles.find(
        (profile) => profile.id === userRef.current?.id,
      );
      if (updated) selectProfile(updated);
    },
    [selectProfile],
  );
  const perform = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      if (alive.current) {
        setPending((count) => count + 1);
        setError("");
      }
      const run = queue.current
        .catch(() => undefined)
        .then(async (): Promise<T> => {
          const execute = async () => {
            mutationEpoch.current++;
            try {
              return await action();
            } finally {
              mutationEpoch.current++;
            }
          };
          if (navigator.locks)
            return navigator.locks.request("playground-mvp-write", execute);
          return execute();
        });
      queue.current = run;
      try {
        return await run;
      } catch (cause) {
        if (alive.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "This action could not be completed.",
          );
        throw cause;
      } finally {
        if (alive.current) setPending((count) => count - 1);
      }
    },
    [],
  );
  const enterWorkspace = useCallback(
    (role: Role, profileId?: string) =>
      perform(async () => {
        if (connected) {
          const identity = await authIdentity();
          if (!identity) throw new Error("Sign in to open your workspace.");
          const snapshot = await loadConnectedWorkspace();
          if (
            identity !== cloudIdentity.current ||
            snapshot.profile.id !== identity
          )
            throw new Error(
              "Your account changed while opening this workspace. Please try again.",
            );
          if (
            snapshot.profile.role !== role ||
            (profileId && profileId !== snapshot.profile.id)
          )
            throw new Error(
              "This workspace belongs to another account or role.",
            );
          commit(snapshot.data);
          selectProfile(snapshot.profile);
          return;
        }
        const current = await readLocal();
        if (
          profileId &&
          !current.profiles.some(
            (profile) => profile.id === profileId && profile.role === role,
          )
        )
          throw new Error(
            "That profile is unavailable in this workspace view.",
          );
        let profile = profileId
          ? current.profiles.find((item) => item.id === profileId)
          : undefined;
        let changed = false;
        if (!profile && role === "tester") {
          const previousTesterId =
            userRef.current?.role === "tester"
              ? userRef.current.id
              : storedId(TESTER_KEY);
          profile =
            current.profiles.find(
              (item) => item.role === "tester" && item.id === previousTesterId,
            ) || current.profiles.find((item) => item.role === "tester");
          if (!profile) {
            draftTester.current ??= newProfile("tester", "Your tester profile");
            profile = draftTester.current;
          }
        }
        if (!profile && role === "founder") {
          const preferredId = storedId(PROFILE_KEY);
          profile =
            current.profiles.find(
              (item) => item.role === "founder" && item.id === preferredId,
            ) || current.profiles.find((item) => item.role === "founder");
        }
        if (!profile && role === "admin")
          profile = current.profiles.find((item) => item.role === "admin");
        if (!profile) {
          profile = newProfile(
            role,
            role === "admin" ? "Operations" : "Your workspace",
          );
          current.profiles.push(profile);
          changed = true;
        }
        if (changed) {
          await writeLocal(current);
          channel.current?.postMessage("update");
        }
        commit(current);
        selectProfile(profile);
      }),
    [commit, connected, perform, selectProfile],
  );
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const mutations = mutationEpoch.current;
    const epoch = authEpoch.current;
    const identity = connected ? await authIdentity() : null;
    if (connected && !identity) return;
    const snapshot = connected ? await loadConnectedWorkspace() : null;
    const next = snapshot?.data ?? (await readLocal());
    if (
      sequence === refreshSequence.current &&
      mutations === mutationEpoch.current &&
      epoch === authEpoch.current &&
      (!connected ||
        (identity === cloudIdentity.current &&
          snapshot?.profile.id === identity))
    ) {
      commit(next);
      if (snapshot) selectProfile(snapshot.profile);
    }
  }, [commit, connected, selectProfile]);
  useEffect(() => {
    alive.current = true;
    let subscribed = true;
    if (connected && authClient) {
      const openSession = async (identity: string | null) => {
        const epoch = ++authEpoch.current;
        cloudIdentity.current = identity;
        userRef.current = null;
        if (subscribed) {
          setUser(null);
          setData(emptyData());
          setLoading(Boolean(identity));
          setError("");
        }
        if (!identity) {
          if (subscribed) setLoading(false);
          return;
        }
        try {
          const snapshot = await loadConnectedWorkspace();
          if (
            subscribed &&
            epoch === authEpoch.current &&
            snapshot.profile.id === identity
          ) {
            commit(snapshot.data);
            selectProfile(snapshot.profile);
          }
        } catch (cause) {
          if (subscribed && epoch === authEpoch.current)
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not open your connected workspace.",
            );
        } finally {
          if (subscribed && epoch === authEpoch.current) setLoading(false);
        }
      };
      const { data: subscription } = authClient.auth.onAuthStateChange(
        (event, session) => {
          if (
            event === "TOKEN_REFRESHED" &&
            cloudIdentity.current === session?.user.id
          )
            return;
          // Supabase holds its auth lock during the callback; make requests after it returns.
          setTimeout(() => {
            if (subscribed) void openSession(session?.user.id ?? null);
          }, 0);
        },
      );
      void authIdentity()
        .then((identity) => {
          if (subscribed) void openSession(identity);
        })
        .catch((cause) => {
          if (subscribed) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not read your session.",
            );
            setLoading(false);
          }
        });
      const onFocus = () => {
        if (cloudIdentity.current) void refresh().catch(() => undefined);
      };
      window.addEventListener("focus", onFocus);
      const polling = setInterval(() => {
        if (cloudIdentity.current && document.visibilityState === "visible")
          void refresh().catch(() => undefined);
      }, 15000);
      return () => {
        subscribed = false;
        alive.current = false;
        subscription.subscription.unsubscribe();
        window.removeEventListener("focus", onFocus);
        clearInterval(polling);
      };
    }
    void enterWorkspace("founder")
      .catch((cause) => {
        if (subscribed)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not open your workspace.",
          );
      })
      .finally(() => {
        if (subscribed) setLoading(false);
      });
    if ("BroadcastChannel" in window) {
      const updates = new BroadcastChannel("playground-mvp-updates");
      channel.current = updates;
      updates.onmessage = () => {
        void refresh().catch((cause) => {
          if (subscribed)
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not refresh your workspace.",
            );
        });
      };
    }
    return () => {
      subscribed = false;
      alive.current = false;
      channel.current?.close();
      channel.current = null;
    };
  }, [commit, connected, enterWorkspace, refresh, selectProfile]);
  const command = useCallback(
    (action: Command) => {
      const selected = userRef.current;
      return perform(async (): Promise<CommandResult> => {
        if (connected) {
          if (!selected || selected.id !== cloudIdentity.current)
            throw new Error("Sign in to make this change.");
          const result =
            action.type === "synthesize-report"
              ? await connectedRequest<CommandResult>("/api/synthesis", {
                  campaignId: action.campaignId,
                  method: action.method ?? "structured",
                })
              : await commandConnectedWorkspace(action);
          if (selected.id !== cloudIdentity.current)
            throw new Error(
              "Your account changed while saving. Refresh your workspace.",
            );
          commit(result.data);
          return result;
        }
        const current = await readLocal();
        let actor = current.profiles.find(
          (profile) => profile.id === selected?.id,
        );
        if (
          !actor &&
          selected?.role === "tester" &&
          action.type === "update-profile"
        ) {
          if (
            action.profile.name.trim().length < 2 ||
            action.profile.name.trim() === "Your tester profile"
          )
            throw new Error(
              "Enter the tester’s actual name before saving their profile.",
            );
          actor = { ...selected, name: action.profile.name.trim() };
          current.profiles.push(actor);
        }
        if (!actor)
          throw new Error("Open a workspace view before making this change.");
        const result = applyCommand(current, actor, action);
        await writeLocal(result.data);
        commit(result.data);
        channel.current?.postMessage("update");
        return result;
      });
    },
    [commit, connected, perform],
  );
  const addTester = useCallback(
    (input: { name: string; expertise?: string[] }) =>
      perform(async () => {
        if (connected)
          throw new Error(
            "Testers join with their own account. Invite registered testers from Operations.",
          );
        const name = input.name.trim();
        if (name.length < 2 || name === "Your tester profile")
          throw new Error("Enter the human tester’s name.");
        const expertise = [
          ...new Set(
            (input.expertise || []).map((item) => item.trim()).filter(Boolean),
          ),
        ];
        if (expertise.length > 20)
          throw new Error("Enter up to 20 expertise tags.");
        const current = await readLocal();
        const profile = { ...newProfile("tester", name), expertise };
        current.profiles.push(profile);
        await writeLocal(current);
        commit(current);
        channel.current?.postMessage("update");
        return profile;
      }),
    [commit, connected, perform],
  );
  const checkout = useCallback(
    (campaignId: string) => {
      const selected = userRef.current;
      return perform(async () => {
        if (connected) {
          if (
            !selected ||
            selected.id !== cloudIdentity.current ||
            selected.role !== "founder"
          )
            throw new Error("Sign in to your founder account before checkout.");
          const result = await connectedRequest<{ url: string }>(
            "/api/checkout",
            { campaignId },
          );
          if (selected.id !== cloudIdentity.current)
            throw new Error(
              "Your account changed before checkout opened. Sign in to the campaign owner account and try again.",
            );
          const checkoutUrl = new URL(result.url);
          if (
            checkoutUrl.protocol !== "https:" ||
            checkoutUrl.hostname !== "checkout.stripe.com"
          )
            throw new Error(
              "The payment provider returned an invalid checkout URL.",
            );
          window.location.assign(checkoutUrl.href);
          return;
        }
        const current = await readLocal();
        const actor = current.profiles.find(
          (profile) => profile.id === selected?.id,
        );
        if (!actor)
          throw new Error("Open your founder workspace before checkout.");
        const result = applyCommand(current, actor, {
          type: "record-payment",
          campaignId,
          reference: `local-simulation-${campaignId}`,
        });
        await writeLocal(result.data);
        commit(result.data);
        channel.current?.postMessage("update");
      });
    },
    [commit, connected, perform],
  );
  const suggestTasks = useCallback(
    (input: {
      url: string;
      audience: string;
      objective: string;
      assumption: string;
    }) =>
      perform(async () =>
        connected
          ? connectedRequest<{
              tasks: import("./types").Task[];
              method: "ai" | "template";
            }>("/api/mission", input)
          : { tasks: suggestMission(input), method: "template" as const },
      ),
    [connected, perform],
  );
  const uploadEvidence = useCallback(
    (file: File, assignmentId: string) => {
      const selected = userRef.current;
      return perform(async (): Promise<EvidenceAsset> => {
        if (
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            file.type,
          )
        )
          throw new Error(
            "Upload a PNG, JPEG, WebP or GIF screenshot. Add video recordings as links.",
          );
        if (file.size > 3 * 1024 * 1024)
          throw new Error("Keep screenshots under 3 MB.");
        if (connected) {
          if (
            !selected ||
            selected.id !== cloudIdentity.current ||
            selected.role !== "tester"
          )
            throw new Error(
              "Sign in to your assigned tester account before uploading evidence.",
            );
          const uploaded = await uploadConnectedEvidence(file, assignmentId);
          if (selected.id !== cloudIdentity.current)
            throw new Error(
              "Your account changed while uploading evidence. Reopen your assignment.",
            );
          return uploaded;
        }
        const current = await readLocal();
        const assignment = current.assignments.find(
          (item) => item.id === assignmentId && item.testerId === selected?.id,
        );
        if (
          !assignment ||
          !["accepted", "revision"].includes(assignment.status)
        )
          throw new Error("Only your active assignment can receive evidence.");
        return {
          id: crypto.randomUUID(),
          name: file.name,
          kind: "image",
          url: await fileBase64(file),
        };
      });
    },
    [connected, perform],
  );
  const value = useMemo<StoreValue>(
    () => ({
      data,
      user,
      mode: connected ? "connected" : "local",
      loading,
      busy: pending > 0,
      error,
      clearError: () => setError(""),
      enterWorkspace,
      addTester,
      switchLocalAccount: (id) => {
        if (connected) return;
        const profile = data.profiles.find((item) => item.id === id);
        if (profile) selectProfile(profile);
      },
      command,
      checkout,
      cancelCheckout: (campaignId) =>
        perform(async () => {
          if (!connected) return;
          await connectedRequest("/api/checkout", { campaignId, cancel: true });
          await refresh();
        }),
      suggestTasks,
      uploadEvidence,
      refresh,
    }),
    [
      data,
      connected,
      perform,
      user,
      loading,
      pending,
      error,
      enterWorkspace,
      addTester,
      selectProfile,
      command,
      checkout,
      suggestTasks,
      uploadEvidence,
      refresh,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMvp() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider missing.");
  return value;
}
