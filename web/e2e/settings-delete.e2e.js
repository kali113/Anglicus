import { expect, test } from "@playwright/test";

async function seedMistake(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("AnglicusMistakes", 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("mistakes")) {
          const store = db.createObjectStore("mistakes", { keyPath: "id" });
          store.createIndex("category", "category", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onerror = () => {
        reject(request.error ?? new Error("Could not open mistakes database"));
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["mistakes"], "readwrite");
        const store = tx.objectStore("mistakes");

        store.put({
          id: "delete-e2e-mistake",
          sentence: "She have two cats.",
          correction: "She has two cats.",
          explanation: "Use 'has' for third person singular.",
          category: "present_perfect",
          timestamp: new Date().toISOString(),
          source: "lesson",
        });

        tx.onerror = () => {
          reject(tx.error ?? new Error("Could not seed mistake"));
        };

        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
}

async function getMistakeCount(page) {
  return await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const request = indexedDB.open("AnglicusMistakes", 1);

      request.onerror = () => {
        reject(request.error ?? new Error("Could not open mistakes database"));
      };

      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["mistakes"], "readonly");
        const store = tx.objectStore("mistakes");
        const readRequest = store.getAll();

        readRequest.onerror = () => {
          reject(readRequest.error ?? new Error("Could not read mistakes"));
        };

        readRequest.onsuccess = () => {
          db.close();
          resolve(readRequest.result.length);
        };
      };
    });
  });
}

test("delete flow clears browser state and redirects to onboarding", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("clear-data-trigger")).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem("anglicus_settings", JSON.stringify({ theme: "dark" }));
    localStorage.setItem("anglicus_delete_probe", "true");
  });
  await seedMistake(page);

  await page.getByTestId("clear-data-trigger").click();
  await page.getByTestId("clear-data-confirm").click();

  await expect(page).toHaveURL(/\/onboarding(?:\?.*)?$/);

  await expect.poll(async () => {
    return await page.evaluate(() => localStorage.getItem("anglicus_settings"));
  }).toBeNull();

  await expect.poll(async () => {
    return await page.evaluate(() => localStorage.getItem("anglicus_delete_probe"));
  }).toBeNull();

  await expect.poll(async () => await getMistakeCount(page)).toBe(0);
});
