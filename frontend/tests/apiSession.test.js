import test from "node:test";
import assert from "node:assert/strict";

import { shouldExpireSession } from "../src/api.js";

test("missing current account invalidates a stored session", () => {
  assert.equal(shouldExpireSession(404, "/user/me", "jwt"), true);
  assert.equal(shouldExpireSession(404, "/user/settings", "jwt"), true);
});

test("ordinary missing resources do not invalidate a valid session", () => {
  assert.equal(shouldExpireSession(404, "/analysis/status/missing", "jwt"), false);
  assert.equal(shouldExpireSession(404, "/user/me", ""), false);
  assert.equal(shouldExpireSession(401, "/analysis/history", "jwt"), true);
});
