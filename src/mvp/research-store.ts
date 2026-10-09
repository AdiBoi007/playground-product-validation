import { validateResearchIdea } from "./research";
import type { ResearchIdea } from "./research";

export const RESEARCH_SCHEMA_VERSION = 1;
interface StoredResearchIdea {
  schemaVersion: 1;
  id: string;
  founderId: string;
  idea: ResearchIdea;
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
      new Error("Research storage is unavailable in this browser."),
    );
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      "playground-research",
      RESEARCH_SCHEMA_VERSION,
    );
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains("ideas")
        ? request.transaction!.objectStore("ideas")
        : request.result.createObjectStore("ideas", { keyPath: "id" });
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
            ? "Saved research uses a newer version. Update the app to open it."
            : "Your browser could not open research storage.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error("Close other tabs of this site to open research storage."),
      );
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

export function deserializeResearchIdea(
  value: unknown,
  founderId: string,
): ResearchIdea {
  const owner = key(founderId, "Workspace ID");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The saved research record could not be read.");
  const stored = value as Partial<StoredResearchIdea>;
  if (stored.schemaVersion !== RESEARCH_SCHEMA_VERSION)
    throw new Error(
      "This research record uses an unsupported schema version. Your data has been kept.",
    );
  if (stored.founderId !== owner)
    throw new Error("This idea belongs to another workspace.");
  const idea = validateResearchIdea(stored.idea);
  if (idea.founderId !== owner || stored.id !== idea.id)
    throw new Error(
      "The saved research record does not match its workspace or ID.",
    );
  return idea;
}

export async function getIdeas(founderId: string): Promise<ResearchIdea[]> {
  const owner = key(founderId, "Workspace ID");
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("ideas")
      .objectStore("ideas")
      .index("founderId")
      .getAll(owner);
    request.onsuccess = () => {
      try {
        resolve(
          (request.result as unknown[])
            .map((value) => deserializeResearchIdea(value, owner))
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt),
            ),
        );
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () =>
      reject(new Error("Your saved research could not be loaded."));
  });
}

export function prepareResearchSave(
  idea: ResearchIdea,
  existing?: ResearchIdea,
  now = Date.now(),
): ResearchIdea {
  if (existing && idea.updatedAt !== existing.updatedAt)
    throw new Error("This idea changed in another tab. Reload before saving.");
  return {
    ...idea,
    createdAt: existing?.createdAt || idea.createdAt,
    updatedAt: new Date(
      Math.max(now, existing ? Date.parse(existing.updatedAt) + 1 : now),
    ).toISOString(),
  };
}

export async function saveIdea(value: ResearchIdea): Promise<ResearchIdea> {
  const idea = validateResearchIdea(value);
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("ideas", "readwrite");
    const store = transaction.objectStore("ideas");
    const request = store.get(idea.id);
    let saved: ResearchIdea;
    let validationError: unknown;
    request.onsuccess = () => {
      try {
        const existing = request.result
          ? deserializeResearchIdea(request.result, idea.founderId)
          : undefined;
        saved = prepareResearchSave(idea, existing);
        const record: StoredResearchIdea = {
          schemaVersion: 1,
          id: saved.id,
          founderId: saved.founderId,
          idea: saved,
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
            "Your research could not be saved. Check device storage and try again.",
          ),
      );
    transaction.onabort = () =>
      reject(
        validationError ||
          new Error("Your research change was not saved. Please try again."),
      );
  });
}

export async function deleteIdea(founderId: string, id: string): Promise<void> {
  const owner = key(founderId, "Workspace ID");
  const ideaId = key(id, "Idea ID");
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("ideas", "readwrite");
    const store = transaction.objectStore("ideas");
    const request = store.get(ideaId);
    let validationError: unknown;
    request.onsuccess = () => {
      try {
        if (request.result) {
          deserializeResearchIdea(request.result, owner);
          store.delete(ideaId);
        }
      } catch (error) {
        validationError = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        validationError ||
          new Error("This research idea could not be deleted."),
      );
    transaction.onabort = () =>
      reject(
        validationError || new Error("The research deletion was not saved."),
      );
  });
}
