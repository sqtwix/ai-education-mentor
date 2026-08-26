import test from "node:test";
import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const { defaultSettings, readLocalSettings, writeLocalSettings } = await import("../src/settingsService.js");

test("interface settings are isolated between accounts", () => {
  storage.clear();
  localStorage.setItem("userEmail", "first@example.test");
  writeLocalSettings({ ...defaultSettings, theme: "dark", minimalUi: true });

  localStorage.setItem("userEmail", "second@example.test");
  assert.equal(readLocalSettings().theme, "system");
  writeLocalSettings({ ...defaultSettings, theme: "light" });

  localStorage.setItem("userEmail", "first@example.test");
  assert.equal(readLocalSettings().theme, "dark");
  assert.equal(readLocalSettings().minimalUi, true);
});
