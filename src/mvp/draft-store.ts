let connection: Promise<IDBDatabase> | undefined;

function database() {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("playground-mvp-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Your browser could not open draft storage."));
  });
  return connection;
}

export async function readDraft<T>(key: string): Promise<T | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("drafts").objectStore("drafts").get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () =>
      reject(new Error("Your saved feedback draft could not be loaded."));
  });
}

export async function writeDraft<T>(key: string, value: T): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        new Error(
          "Your browser could not save this draft. Keep the page open until you submit.",
        ),
      );
    transaction.onabort = () =>
      reject(
        new Error(
          "Your draft could not be saved. Check your device’s available storage.",
        ),
      );
  });
}

export async function removeDraft(key: string): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("drafts", "readwrite");
    transaction.objectStore("drafts").delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        new Error("The submitted draft could not be removed from this device."),
      );
  });
}
