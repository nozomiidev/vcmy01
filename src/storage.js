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

export class TakeStore {
  constructor() {
    this.db = null;
  }

  open() {
    return new Promise((resolve) => {
      const req = indexedDB.open("voiceforge-product-db", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("takes")) db.createObjectStore("takes", { keyPath: "id" });
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
