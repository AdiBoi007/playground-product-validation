import { validateSandbox } from "./sandbox";
import type { Sandbox } from "./sandbox";
import { authHeaders, authIdentity, cloudConfigured } from "./auth-client";
import { prepareSandboxSave } from "./sandbox-persistence";
export { prepareSandboxSave } from "./sandbox-persistence";

export const SANDBOX_SCHEMA_VERSION = 1;
interface StoredSandbox {
  schemaVersion: 1;
  id: string;
  founderId: string;
  sandbox: Sandbox;
}
let connection: Promise<IDBDatabase> | undefined;
const key = (value: string, label: string) => {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new Error(`${label} is required.`);
  return value.trim();
};

function database() {
  if (typeof indexedDB === "undefined")
    return Promise.reject(
      new Error("Sandbox storage is unavailable in this browser."),
    );
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      "playground-sandboxes",
      SANDBOX_SCHEMA_VERSION,
    );
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains("records")
        ? request.transaction!.objectStore("records")
        : request.result.createObjectStore("records", { keyPath: "id" });
      if (!store.indexNames.contains("founderId"))
        store.createIndex("founderId", "founderId", { unique: false });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
    request.onerror = () =>
      reject(
        new Error(
          request.error?.name === "VersionError"
            ? "Saved sandbox uses a newer version. Update the app to open it."
            : "Your browser could not open sandbox storage.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error("Close other tabs of this site to open sandbox storage."),
      );
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export function deserializeSandbox(value: unknown, founderId: string): Sandbox {
  const owner = key(founderId, "Workspace ID");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The saved sandbox record could not be read.");
  const stored = value as Partial<StoredSandbox>;
  if (stored.schemaVersion !== SANDBOX_SCHEMA_VERSION)
    throw new Error(
      "This sandbox record uses an unsupported schema version. Your data has been kept.",
    );
  if (stored.founderId !== owner)
    throw new Error("This sandbox belongs to another workspace.");
  const sandbox = validateSandbox(stored.sandbox);
  if (sandbox.founderId !== owner || stored.id !== sandbox.id)
    throw new Error(
      "The saved sandbox record does not match its workspace or ID.",
    );
  return sandbox;
}

export async function getSandboxes(founderId: string): Promise<Sandbox[]> {
  const owner = key(founderId, "Workspace ID");
  if (cloudConfigured()) {
    if ((await authIdentity()) !== owner)
      throw new Error("This sandbox belongs to another account.");
    const value = await cloudRequest();
    if (!Array.isArray(value.sandboxes))
      throw new Error("The saved sandboxes could not be read.");
    return value.sandboxes.map((item: unknown) => validateSandbox(item));
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("records")
      .objectStore("records")
      .index("founderId")
      .getAll(owner);
    request.onsuccess = () => {
      try {
        resolve(
          (request.result as unknown[])
            .map((value) => deserializeSandbox(value, owner))
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            ),
        );
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () =>
      reject(new Error("Your saved sandbox could not be loaded."));
  });
}

export async function saveSandbox(value: Sandbox): Promise<Sandbox> {
  const sandbox = validateSandbox(value);
  if (cloudConfigured()) {
    const saved = await cloudRequest({ action: "save", sandbox });
    return validateSandbox(saved.sandbox);
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("records", "readwrite");
    const store = transaction.objectStore("records");
    const request = store.get(sandbox.id);
    let saved: Sandbox;
    let validationError: unknown;
    request.onsuccess = () => {
      try {
        const existing = request.result
          ? deserializeSandbox(request.result, sandbox.founderId)
          : undefined;
        saved = prepareSandboxSave(sandbox, existing);
        const record: StoredSandbox = {
          schemaVersion: 1,
          id: saved.id,
          founderId: saved.founderId,
          sandbox: saved,
        };
        store.put(record);
      } catch (error) {
        validationError = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(saved!);
    transaction.onerror = () =>
      reject(
        validationError ||
          new Error(
            "Your sandbox could not be saved. Check device storage and try again.",
          ),
      );
    transaction.onabort = () =>
      reject(
        validationError ||
          new Error("Your sandbox change was not saved. Please try again."),
      );
  });
}

export async function deleteSandbox(
  founderId: string,
  id: string,
): Promise<void> {
  const owner = key(founderId, "Workspace ID");
  const sandboxId = key(id, "Sandbox ID");
  if (cloudConfigured()) {
    if ((await authIdentity()) !== owner)
      throw new Error("This sandbox belongs to another account.");
    await cloudRequest({ action: "delete", id: sandboxId });
    return;
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("records", "readwrite");
    const store = transaction.objectStore("records");
    const request = store.get(sandboxId);
    let validationError: unknown;
    request.onsuccess = () => {
      try {
        if (request.result) {
          deserializeSandbox(request.result, owner);
          store.delete(sandboxId);
        }
      } catch (error) {
        validationError = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        validationError || new Error("This sandbox could not be deleted."),
      );
    transaction.onabort = () =>
      reject(
        validationError || new Error("The sandbox deletion was not saved."),
      );
  });
}

async function cloudRequest(
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch("/api/sandboxes", {
    method: body ? "POST" : "GET",
    headers: {
      ...(await authHeaders()),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    credentials: "same-origin",
    signal: AbortSignal.timeout(30000),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok || !value || typeof value !== "object")
    throw new Error(value?.error || "Sandbox cloud storage is unavailable.");
  return value;
}
