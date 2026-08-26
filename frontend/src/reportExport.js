import verdanaBoldUrl from "./assets/fonts/Verdana-Bold.ttf?url";
import verdanaUrl from "./assets/fonts/Verdana.ttf?url";

const BRAND_BLUE = [27, 85, 155];
const SOFT_BLUE = [235, 243, 252];
const TEXT_COLOR = [30, 41, 59];
const PDF_FONT = "Verdana";

const formatExportDate = () =>
  new Intl.DateTimeFormat("ru-RU", {
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

export async function exportReportToPdf(report) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await registerPdfFonts(doc);

  const traj = report.result?.trajectory || report.result?.courses_analysis?.[0] || report.result || {};
  const exportDate = formatExportDate();
  const empName = traj.employee_name || "Не указано";
  const position = traj.position || "Не указано";
  const dept = traj.department || "Не указано";

  // Header Banner
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
  doc.text(`Сотрудник: ${empName} | Должность: ${position} | ${dept}`, 14, 28);

  let currentY = 40;

  // Резюме
  if (traj.summary) {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.text("Методическое заключение ИИ-экспертов:", 14, currentY);
    currentY += 6;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    const splitSummary = doc.splitTextToSize(traj.summary, 182);
    doc.text(splitSummary, 14, currentY);
    currentY += splitSummary.length * 4.5 + 4;
  }

  // Этапы обучения
  const stages = traj.stages || [];
  for (const stage of stages) {
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
      doc.text(`Цель: ${stage.stage_goal}`, 14, currentY);
      currentY += 5;
    }

    const tableRows = (stage.courses || []).map((c) => [
      c.course_name,
      c.type || "Не указан",
      c.duration_hours ? `${c.duration_hours} ч.` : "Не указано",
      (c.competencies || []).join(", "),
      c.justification || "Не указано"
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["Курс", "Тип", "Объем", "Компетенции", "Обоснование ИИ"]],
      body: tableRows,
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

  // Радар компетенций
  const radar = traj.competency_radar || [];
  if (radar.length > 0) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("Матрица развития компетенций", 14, currentY);
    currentY += 5;

    const radarRows = radar.map((r) => [
      r.competency,
      r.current_level === undefined || r.current_level === null ? "Не указано" : `${r.current_level}%`,
      r.target_level === undefined || r.target_level === null ? "Не указано" : `${r.target_level}%`,
      r.growth === undefined || r.growth === null ? "Не указано" : `${r.growth >= 0 ? "+" : ""}${r.growth}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [["Компетенция", "Текущий уровень", "Целевой уровень", "Ожидаемый прирост"]],
      body: radarRows,
      styles: { font: PDF_FONT, fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [45, 110, 185], textColor: [255, 255, 255], fontStyle: "bold" },
      margin: { left: 14, right: 14 },
    });
  }

  const fileName = safeFileName(`ИОТ_${empName}_${position}`, "pdf");
  doc.save(fileName);
}

export async function exportReportToExcel(report) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Корпоративный университет Санкт-Петербурга";
  workbook.created = new Date();

  const traj = report.result?.trajectory || report.result?.courses_analysis?.[0] || report.result || {};
  const empName = traj.employee_name || "Не указано";
  const position = traj.position || "Не указано";

  // Лист 1: Траектория обучения
  const sheet1 = workbook.addWorksheet("Индивидуальная траектория");
  sheet1.columns = [
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

  // Header style
  sheet1.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet1.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B559B" } };

  const stages = traj.stages || [];
  for (const st of stages) {
    for (const c of st.courses || []) {
      sheet1.addRow({
        stage: st.stage_title,
        period: st.recommended_period,
        course: c.course_name,
        type: c.type,
        hours: c.duration_hours,
        competencies: (c.competencies || []).join(", "),
        priority: c.priority,
        status: c.status || "Не указан",
        justification: c.justification,
      });
    }
  }

  // Лист 2: Матрица компетенций
  const sheet2 = workbook.addWorksheet("Матрица компетенций");
  sheet2.columns = [
    { header: "Компетенция", key: "competency", width: 35 },
    { header: "Текущий уровень (%)", key: "current", width: 22 },
    { header: "Целевой уровень (%)", key: "target", width: 22 },
    { header: "Прирост (%)", key: "growth", width: 18 },
  ];
  sheet2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A75C7" } };

  const radar = traj.competency_radar || [];
  for (const r of radar) {
    sheet2.addRow({
      competency: r.competency,
      current: r.current_level,
      target: r.target_level,
      growth: `+${r.growth}%`,
    });
  }

  // Лист 3: Бенчмарк коллег
  const sheet3 = workbook.addWorksheet("Бенчмарк по должности");
  sheet3.columns = [
    { header: "Популярный курс для должности", key: "course_name", width: 45 },
    { header: "Тип", key: "type", width: 12 },
    { header: "Популярность (%)", key: "popularity", width: 20 },
    { header: "Успешность сдачи (%)", key: "success", width: 22 },
  ];
  sheet3.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet3.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF388E3C" } };

  const benchCourses = traj.colleague_benchmark?.top_recommended_for_position || [];
  for (const b of benchCourses) {
    sheet3.addRow({
      course_name: b.course_name,
      type: b.type,
      popularity: b.popularity_pct === undefined || b.popularity_pct === null ? "Не указано" : `${b.popularity_pct}%`,
      success: b.success_rate === undefined || b.success_rate === null ? "Не указано" : `${b.success_rate}%`,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(`ИОТ_${empName}_${position}`, "xlsx");
  a.click();
  URL.revokeObjectURL(url);
}

export function exportReportToJson(report) {
  const traj = report.result?.trajectory || report.result || {};
  const empName = traj.employee_name || "Не указано";
  const jsonStr = JSON.stringify(traj, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeFileName(`ИОТ_${empName}`, "json");
  a.click();
  URL.revokeObjectURL(url);
}

export const exportReportToXlsx = exportReportToExcel;
