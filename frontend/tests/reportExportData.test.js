import test from "node:test";
import assert from "node:assert/strict";

import { resolveReportTrajectoryForExport } from "../src/reportExportData.js";

test("verified report exports its trajectory without changing data", () => {
  const trajectory = { employee_name: "Профиль", stages: [] };
  const report = {
    status: "Completed",
    result: { quality_status: "verified", trajectory },
  };

  assert.equal(resolveReportTrajectoryForExport(report), trajectory);
});

test("degraded report exports without additional markers or metadata", () => {
  const trajectory = { employee_name: "Профиль", quality_status: "degraded", stages: [] };
  const report = {
    status: "CompletedWithLimitations",
    result: { quality_status: "degraded", trajectory },
  };
  const exported = resolveReportTrajectoryForExport(report);

  assert.equal(exported, trajectory);
  assert.equal(Object.hasOwn(exported, "export_metadata"), false);
  assert.deepEqual(exported, trajectory);
});
