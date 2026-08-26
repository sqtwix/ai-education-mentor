import test from "node:test";
import assert from "node:assert/strict";
import {
  getBatchTrajectories,
  requiresExplicitBatchSelection,
  resolveTrajectoryForDisplay,
} from "../src/trajectorySelection.js";

const first = { trajectory_id: "first", employee_name: "Профиль 1", stages: [] };
const second = { trajectory_id: "second", employee_name: "Профиль 2", stages: [] };

test("multi-profile batch is not resolved until the user selects a profile", () => {
  const result = { courses_analysis: [first, second] };

  assert.equal(requiresExplicitBatchSelection(result), true);
  assert.equal(resolveTrajectoryForDisplay(result), null);
  assert.equal(resolveTrajectoryForDisplay(result, 1), second);
});

test("single trajectory can be opened without an unnecessary selector", () => {
  const result = { courses_analysis: [first] };

  assert.equal(requiresExplicitBatchSelection(result), false);
  assert.equal(resolveTrajectoryForDisplay(result), first);
});

test("malformed batch entries are excluded", () => {
  const result = { courses_analysis: [first, { trajectory_id: "broken" }, null] };

  assert.deepEqual(getBatchTrajectories(result), [first]);
});
