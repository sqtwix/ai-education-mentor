import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const exportSource = await readFile(new URL("../src/reportExport.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const pagesSource = await readFile(new URL("../src/components/Pages.jsx", import.meta.url), "utf8");

test("PDF, XLSX and JSON export the complete report without extra metadata", () => {
  assert.match(exportSource, /resolveReportTrajectoriesForExport\(report\)/);
  assert.match(exportSource, /resolveReportJsonForExport\(report\)/);
  assert.doesNotMatch(exportSource, /export_metadata|ПРЕДВАРИТЕЛЬНЫЙ ОТЧЕТ|водян/i);
});

test("degraded status does not block export controls", () => {
  assert.doesNotMatch(appSource, /Резервный результат нельзя экспортировать/);
  assert.doesNotMatch(pagesSource, /disabled=\{isDegraded/);
  assert.doesNotMatch(pagesSource, /exportNeedsProfileSelection|Сначала выберите профиль/);
  assert.match(pagesSource, /Сохранить весь отчет/);
});
