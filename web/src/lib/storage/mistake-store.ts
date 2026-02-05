/**
 * Mistake tracking using IndexedDB
 * Stores user mistakes for personalized exercises
 */

import type { Mistake, MistakeStats } from "$lib/types/user.js";
import type { WeakArea } from "$lib/types/user.js";

const DB_NAME = "AnglicusMistakes";
const DB_VERSION = 1;
const STORE_NAME = "mistakes";

let db: IDBDatabase | null = null;

async function getDb(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

export async function addMistake(
  mistake: Omit<Mistake, "id">,
): Promise<string> {
  const database = await getDb();
  const id = crypto.randomUUID();
  const fullMistake: Mistake = { ...mistake, id };

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(fullMistake);

    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

export async function getMistakesByCategory(
  category: WeakArea,
): Promise<Mistake[]> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("category");
    const request = index.getAll(category);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getRecentMistakes(limit = 10): Promise<Mistake[]> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    const request = index.openCursor(null, "prev");

    const results: Mistake[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getMistakeStats(): Promise<MistakeStats[]> {
  const allMistakes = await getAllMistakes();
  const categoryMap = new Map<
    WeakArea,
    { total: number; correct: number; lastMistakeAt: string }
  >();

  // Initialize all categories with zeros
  const categories: WeakArea[] = [
    "articles",
    "present_perfect",
    "past_tense",
    "prepositions",
    "false_friends",
    "conditionals",
    "phrasal_verbs",
  ];
  for (const cat of categories) {
    categoryMap.set(cat, { total: 0, correct: 0, lastMistakeAt: "" });
  }

  // Count mistakes by category
  for (const mistake of allMistakes) {
    const current = categoryMap.get(mistake.category)!;
    current.total++;
    if (mistake.timestamp > current.lastMistakeAt) {
      current.lastMistakeAt = mistake.timestamp;
    }
    categoryMap.set(mistake.category, current);
  }

  return Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    total: data.total,
    correct: 0, // We'd track correct answers separately
    accuracy: 0, // Calculated from (correct / total) * 100
    lastMistakeAt: data.lastMistakeAt || undefined,
  }));
}

export async function getAllMistakes(): Promise<Mistake[]> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMistake(id: string): Promise<void> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllMistakes(): Promise<void> {
  const database = await getDb();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Track correct answers for accuracy calculation
const STATS_STORE_NAME = "mistake_stats";

async function recordAnswer(category: WeakArea, isCorrect: boolean): Promise<void> {
  const database = await getDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STATS_STORE_NAME], "readwrite");
    if (!database.objectStoreNames.contains(STATS_STORE_NAME)) {
      resolve();
      return;
    }
    const store = transaction.objectStore(STATS_STORE_NAME);
    const request = store.get(category);

    request.onsuccess = () => {
      const data = request.result || { category, correct: 0, total: 0 };
      if (isCorrect) data.correct++;
      data.total++;
      store.put(data);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function recordCorrectAnswer(category: WeakArea): Promise<void> {
  return recordAnswer(category, true);
}

export async function recordIncorrectAnswer(category: WeakArea): Promise<void> {
  return recordAnswer(category, false);
}
