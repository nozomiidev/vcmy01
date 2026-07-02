export const prefs = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`voiceforge:${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`voiceforge:${key}`, JSON.stringify(value));
    } catch {}
  }
};

const DB_NAME = "voiceforge-product-db";
const DB_VERSION = 2;

function ensureStores(db) {
  if (!db.objectStoreNames.contains("takes")) db.createObjectStore("takes", { keyPath: "id" });
  if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
}

export class TakeStore {
  constructor() {
    this.db = null;
  }

  open() {
    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        ensureStores(req.result);
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  }

  put(take) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      const tx = this.db.transaction("takes", "readwrite");
      tx.objectStore("takes").put({
        id: take.id,
        name: take.name,
        date: take.date,
        duration: take.duration,
        sampleRate: take.sampleRate,
        blob: take.blob
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  all() {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction("takes", "readonly");
      const req = tx.objectStore("takes").getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.date - a.date));
      req.onerror = () => resolve([]);
    });
  }

  delete(id) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      const tx = this.db.transaction("takes", "readwrite");
      tx.objectStore("takes").delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  clear() {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      const tx = this.db.transaction("takes", "readwrite");
      tx.objectStore("takes").clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
}

export class ProjectStore {
  constructor() {
    this.db = null;
  }

  open() {
    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        ensureStores(req.result);
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(true);
      };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    });
  }

  put(project) {
    return new Promise((resolve) => {
      if (!this.db || !project?.id) return resolve(false);
      const tx = this.db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(project);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  replaceAll(projects = []) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      const tx = this.db.transaction("projects", "readwrite");
      const store = tx.objectStore("projects");
      store.clear();
      for (const project of projects) {
        if (project?.id) store.put(project);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  all() {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const tx = this.db.transaction("projects", "readonly");
      const req = tx.objectStore("projects").getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));
      req.onerror = () => resolve([]);
    });
  }

  delete(id) {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      const tx = this.db.transaction("projects", "readwrite");
      tx.objectStore("projects").delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  clear() {
    return new Promise((resolve) => {
      if (!this.db) return resolve(false);
      const tx = this.db.transaction("projects", "readwrite");
      tx.objectStore("projects").clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
}
