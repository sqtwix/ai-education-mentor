import verdanaBoldUrl from "./assets/fonts/Verdana-Bold.ttf?url";
import verdanaUrl from "./assets/fonts/Verdana.ttf?url";
import { resolveReportJsonForExport, resolveReportTrajectoriesForExport } from "./reportExportData";

const BRAND_BLUE = [27, 85, 155];
const SOFT_BLUE = [235, 243, 252];
const TEXT_COLOR = [30, 41, 59];
const PDF_FONT = "Verdana";

const formatExportDate = () => new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date());

const safeFileName = (value, extension) => {
  const baseName = (value || "iot-trajectory")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return `${baseName || "iot-trajectory"}.${extension}`;
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const loadFontBase64 = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to load PDF font");
  return arrayBufferToBase64(await response.arrayBuffer());
};

const registerPdfFonts = async (doc) => {
  const [regularFont, boldFont] = await Promise.all([
    loadFontBase64(verdanaUrl),
    loadFontBase64(verdanaBoldUrl),
  ]);
  doc.addFileToVFS("Verdana.ttf", regularFont);
  doc.addFont("Verdana.ttf", PDF_FONT, "normal");
  doc.addFileToVFS("Verdana-Bold.ttf", boldFont);
  doc.addFont("Verdana-Bold.ttf", PDF_FONT, "bold");
};

const renderTrajectoryPdf = (doc, autoTable, trajectory, exportDate, addLeadingPage) => {
  if (addLeadingPage) doc.addPage();

  const employee = trajectory.employee_name || "Не указано";
  const position = trajectory.position || "Не указано";
  const department = trajectory.department || "Не указано";

  doc.setFillColor(...SOFT_BLUE);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(...BRAND_BLUE);
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(16);
  doc.text("Корпоративный университет Санкт-Петербурга", 14, 13);
  doc.setTextColor(...TEXT_COLOR);
  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "normal");
  doc.text(`Индивидуальная образовательная траектория | ${exportDate}`, 14, 22);
  doc.text(`Сотрудник: ${employee} | Должность: ${position} | ${department}`, 14, 28);

  let currentY = 40;
  if (trajectory.summary) {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.text("Методическое заключение ИИ-экспертов:", 14, currentY);
    currentY += 6;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    const summary = doc.splitTextToSize(trajectory.summary, 182);
    doc.text(summary, 14, currentY);
    currentY += summary.length * 4.5 + 4;
  }

  for (const stage of trajectory.stages || []) {
    if (currentY > 250) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_BLUE);
    doc.text(`${stage.stage_title} (${stage.recommended_period || ""})`, 14, currentY);
    currentY += 5;
    if (stage.stage_goal) {
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...TEXT_COLOR);
      const goal = doc.splitTextToSize(`Цель: ${stage.stage_goal}`, 182);
      doc.text(goal, 14, currentY);
      currentY += goal.length * 4 + 2;
    }
    autoTable(doc, {
      startY: currentY,
      head: [["Курс", "Тип", "Объем", "Компетенции", "Обоснование ИИ"]],
      body: (stage.courses || []).map((course) => [
        course.course_name,
        course.type || "Не указан",
        course.duration_hours ? `${course.duration_hours} ч.` : "Не указано",
        (course.competencies || []).join(", "),
        course.justification || "Не указано",
      ]),
      styles: { font: PDF_FONT, fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: BRAND_BLUE, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 15 },
        2: { cellWidth: 15 },
        3: { cellWidth: 35 },
        4: { cellWidth: 70 },
      },
      margin: { left: 14, right: 14 },
    });
    currentY = doc.lastAutoTable.finalY + 8;
  }

  const radar = trajectory.competency_radar || [];
  if (radar.length > 0) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("Матрица развития компетенций", 14, currentY);
    autoTable(doc, {
      startY: currentY + 5,
      head: [["Компетенция", "Текущий уровень", "Целевой уровень", "Ожидаемый прирост"]],
      body: radar.map((item) => [
        item.competency,
        item.current_level == null ? "Не указано" : `${item.current_level}%`,
        item.target_level == null ? "Не указано" : `${item.target_level}%`,
        item.growth == null ? "Не указано" : `${item.growth >= 0 ? "+" : ""}${item.growth}%`,
      ]),
      styles: { font: PDF_FONT, fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [45, 110, 185], textColor: [255, 255, 255], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
  }
};

export async function exportReportToPdf(report) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const trajectories = resolveReportTrajectoriesForExport(report);
  if (!trajectories.length) throw new Error("В отчете нет траекторий для экспорта.");

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await registerPdfFonts(doc);
  const exportDate = formatExportDate();
  trajectories.forEach((trajectory, index) => {
    renderTrajectoryPdf(doc, autoTableModule.default, trajectory, exportDate, index > 0);
  });

  const label = trajectories.length > 1
    ? `ИОТ_все_${trajectories.length}_профилей`
    : `ИОТ_${trajectories[0].employee_name || "Не_указано"}_${trajectories[0].position || ""}`;
  doc.save(safeFileName(label, "pdf"));
}

const styleHeader = (sheet, color) => {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
};

export async function exportReportToExcel(report) {
  const ExcelJS = (await import("exceljs")).default;
  const trajectories = resolveReportTrajectoriesForExport(report);
  if (!trajectories.length) throw new Error("В отчете нет траекторий для экспорта.");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Корпоративный университет Санкт-Петербурга";
  workbook.created = new Date();

  const trajectorySheet = workbook.addWorksheet("Индивидуальные траектории");
  trajectorySheet.columns = [
    { header: "Сотрудник", key: "employee", width: 32 },
    { header: "Должность", key: "position", width: 32 },
    { header: "ИОГВ", key: "department", width: 32 },
    { header: "Этап", key: "stage", width: 25 },
    { header: "Период", key: "period", width: 15 },
    { header: "Курс", key: "course", width: 45 },
    { header: "Тип", key: "type", width: 10 },
    { header: "Часы", key: "hours", width: 10 },
    { header: "Компетенции", key: "competencies", width: 30 },
    { header: "Приоритет", key: "priority", width: 14 },
    { header: "Статус", key: "status", width: 16 },
    { header: "Обоснование рекомендации ИИ", key: "justification", width: 55 },
  ];
  styleHeader(trajectorySheet, "FF1B559B");

  const radarSheet = workbook.addWorksheet("Матрица компетенций");
  radarSheet.columns = [
    { header: "Сотрудник", key: "employee", width: 32 },
    { header: "Компетенция", key: "competency", width: 35 },
    { header: "Текущий уровень (%)", key: "current", width: 22 },
    { header: "Целевой уровень (%)", key: "target", width: 22 },
    { header: "Прирост (%)", key: "growth", width: 18 },
  ];
  styleHeader(radarSheet, "FF2A75C7");

  const benchmarkSheet = workbook.addWorksheet("Бенчмарк по должности");
  benchmarkSheet.columns = [
    { header: "Сотрудник", key: "employee", width: 32 },
    { header: "Популярный курс для должности", key: "course_name", width: 45 },
    { header: "Тип", key: "type", width: 12 },
    { header: "Популярность (%)", key: "popularity", width: 20 },
    { header: "Успешность сдачи (%)", key: "success", width: 22 },
  ];
  styleHeader(benchmarkSheet, "FF388E3C");

  for (const trajectory of trajectories) {
    const employee = trajectory.employee_name || "Не указано";
    for (const stage of trajectory.stages || []) {
      for (const course of stage.courses || []) {
        trajectorySheet.addRow({
          employee,
          position: trajectory.position,
          department: trajectory.department,
          stage: stage.stage_title,
          period: stage.recommended_period,
          course: course.course_name,
          type: course.type,
          hours: course.duration_hours,
          competencies: (course.competencies || []).join(", "),
          priority: course.priority,
          status: course.status || "Не указан",
          justification: course.justification,
        });
      }
    }
    for (const item of trajectory.competency_radar || []) {
      radarSheet.addRow({ employee, competency: item.competency, current: item.current_level, target: item.target_level, growth: item.growth });
    }
    for (const item of trajectory.colleague_benchmark?.top_recommended_for_position || []) {
      benchmarkSheet.addRow({
        employee,
        course_name: item.course_name,
        type: item.type,
        popularity: item.popularity_pct == null ? "Не указано" : `${item.popularity_pct}%`,
        success: item.success_rate == null ? "Не указано" : `${item.success_rate}%`,
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(
    trajectories.length > 1 ? `ИОТ_все_${trajectories.length}_профилей` : `ИОТ_${trajectories[0].employee_name}`,
    "xlsx",
  );
  link.click();
  URL.revokeObjectURL(url);
}

export function exportReportToJson(report) {
  const data = resolveReportJsonForExport(report);
  const trajectories = resolveReportTrajectoriesForExport(report);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFileName(
    trajectories.length > 1 ? `ИОТ_все_${trajectories.length}_профилей` : `ИОТ_${trajectories[0]?.employee_name || "отчет"}`,
    "json",
  );
  link.click();
  URL.revokeObjectURL(url);
}

export const exportReportToXlsx = exportReportToExcel;
