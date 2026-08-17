import verdanaBoldUrl from "./assets/fonts/Verdana-Bold.ttf?url";
import verdanaUrl from "./assets/fonts/Verdana.ttf?url";

const BRAND_GREEN = [47, 111, 101];
const SOFT_GREEN = [229, 242, 236];
const TEXT_COLOR = [30, 41, 38];
const PDF_FONT = "Verdana";

const formatExportDate = () =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

const safeFileName = (value, extension) => {
  const baseName = (value || "neuroexpert-report")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return `${baseName || "neuroexpert-report"}.${extension}`;
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

  const courseAnalysis = report.result?.courses_analysis?.[0];
  const exportDate = formatExportDate();
  const courseName = courseAnalysis?.course_name || report.course || "Электронный курс";
  const period = courseAnalysis?.period || "Не указан";
  const studentsCount = courseAnalysis?.students_count || 0;

  // Header Banner
  doc.setFillColor(...SOFT_GREEN);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(...BRAND_GREEN);
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(18);
  doc.text("НейроЭксперт", 14, 15);

  doc.setTextColor(...TEXT_COLOR);
  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "normal");
  doc.text(`Период: ${period} | Участников: ${studentsCount} | Создан: ${exportDate}`, 14, 24);

  // Title
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(14);
  doc.text(courseName, 14, 42, { maxWidth: 182 });

  // 1. Статистика (Table)
  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "bold");
  doc.text("1. Количественные показатели удовлетворенности", 14, 52);

  const stats = courseAnalysis?.statistics;
  const rows = [];
  if (stats) {
    const formatNumeric = (metric) => 
      metric ? `${metric.average.toFixed(1)} (мед: ${metric.median.toFixed(0)}, откл: ${metric.std_dev.toFixed(1)})` : "-";
    const formatDist = (metric) => 
      metric?.distribution ? `1-3: ${metric.distribution.low.toFixed(0)}% | 4-7: ${metric.distribution.mid.toFixed(0)}% | 8-10: ${metric.distribution.high.toFixed(0)}%` : "-";

    rows.push([
      "Полезность", 
      formatNumeric(stats.usefulness), 
      formatDist(stats.usefulness)
    ]);
    rows.push([
      "Практико-ориентированность", 
      formatNumeric(stats.practicality), 
      formatDist(stats.practicality)
    ]);
    rows.push([
      "Доступность материала", 
      formatNumeric(stats.accessibility), 
      formatDist(stats.accessibility)
    ]);
    rows.push([
      "Взаимодействие с КУ", 
      formatNumeric(stats.interaction), 
      formatDist(stats.interaction)
    ]);
    if (stats.involvement) {
      rows.push([
        "Вовлеченность", 
        `Вовлечено: ${stats.involvement.involved_percent.toFixed(0)}%`, 
        `Отстранено: ${stats.involvement.detached_percent.toFixed(0)}% (Да: ${stats.involvement.yes_count} / Нет: ${stats.involvement.no_count})`
      ]);
    }
  }

  autoTable(doc, {
    startY: 56,
    head: [["Критерий", "Показатели (Среднее, Медиана, Откл)", "Распределение оценок"]],
    body: rows.length ? rows : [["", "Нет данных", ""]],
    styles: {
      font: PDF_FONT,
      fontSize: 8.5,
      cellPadding: 2,
      textColor: TEXT_COLOR,
    },
    headStyles: {
      fillColor: BRAND_GREEN,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 70 },
      2: { cellWidth: 62 },
    },
    margin: { left: 14, right: 14 },
  });

  // 2. Текстовый анализ отзывов
  const textAnalysisY = (doc.lastAutoTable?.finalY || 100) + 8;
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(11);
  doc.text("2. Результаты качественного анализа отзывов", 14, textAnalysisY);

  const textAnalysis = courseAnalysis?.text_analysis;
  const sentimentText = textAnalysis?.sentiment 
    ? `Тональность комментариев: Позитивные: ${textAnalysis.sentiment.positive.toFixed(0)}%, Нейтральные: ${textAnalysis.sentiment.neutral.toFixed(0)}%, Негативные: ${textAnalysis.sentiment.negative.toFixed(0)}%`
    : "";

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  if (sentimentText) {
    doc.text(sentimentText, 14, textAnalysisY + 5);
  }

  // Top Topics & Problems Table
  const topicsRows = [];
  if (textAnalysis?.top_topics) {
    textAnalysis.top_topics.forEach((t) => {
      topicsRows.push(["Тема", `${t.topic} (Частота: ${t.frequency})`, t.description]);
    });
  }
  if (textAnalysis?.key_problems) {
    textAnalysis.key_problems.forEach((p) => {
      topicsRows.push(["Проблема", `${p.problem} (${p.severity})`, `Упоминается в ${p.frequency_percent.toFixed(0)}% комментариев.`]);
    });
  }

  autoTable(doc, {
    startY: textAnalysisY + (sentimentText ? 8 : 4),
    head: [["Тип", "Название / Метрика", "Описание"]],
    body: topicsRows.length ? topicsRows : [["", "Нет данных", ""]],
    styles: {
      font: PDF_FONT,
      fontSize: 8,
      cellPadding: 2,
      textColor: TEXT_COLOR,
    },
    headStyles: {
      fillColor: BRAND_GREEN,
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 65 },
      2: { cellWidth: 92 },
    },
    margin: { left: 14, right: 14 },
  });

  // Page Break for Report
  doc.addPage();
  
  // Header banner on page 2
  doc.setFillColor(...SOFT_GREEN);
  doc.rect(0, 0, 210, 20, "F");
  doc.setTextColor(...BRAND_GREEN);
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(13);
  doc.text("Аналитическая справка по итогам обучения", 14, 12);
  
  doc.setTextColor(...TEXT_COLOR);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);

  const reportData = courseAnalysis?.analytical_report;
  let cursorY = 28;

  const writeReportSection = (title, content) => {
    if (!content) return;
    
    if (cursorY > 260) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.text(title, 14, cursorY);
    cursorY += 5;

    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    const splitText = doc.splitTextToSize(content, 182);
    
    splitText.forEach((line) => {
      if (cursorY > 280) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(line, 14, cursorY);
      cursorY += 4.2;
    });
    cursorY += 6;
  };

  if (reportData) {
    writeReportSection("Раздел 1. Общая информация о программе", reportData.section1_general_info);
    
    const keyCriteriaText = reportData.section2_key_criteria
      ? `• Полезность: ${reportData.section2_key_criteria.usefulness_summary || ""}\n` +
        `• Практика: ${reportData.section2_key_criteria.practicality_summary || ""}\n` +
        `• Доступность: ${reportData.section2_key_criteria.accessibility_summary || ""}\n` +
        `• Взаимодействие: ${reportData.section2_key_criteria.interaction_summary || ""}\n` +
        `• Вовлеченность: ${reportData.section2_key_criteria.involvement_summary || ""}`
      : "";
    writeReportSection("Раздел 2. Ключевые критерии по программе", keyCriteriaText);

    const suggestionsText = reportData.section3_suggestions
      ? `Исключить темы: ${reportData.section3_suggestions.unwanted_topics?.join(", ") || "нет"}\n` +
        `Добавить темы: ${reportData.section3_suggestions.added_topics?.map(t => `${t.topic} (запросов: ${t.count})`).join("; ") || "нет"}\n` +
        `Формат: ${reportData.section3_suggestions.preferred_format_summary || ""}`
      : "";
    writeReportSection("Раздел 3. Предложения слушателей", suggestionsText);

    const trajectoryText = reportData.section4_trajectory
      ? `• Востребованность: ${reportData.section4_trajectory.further_implementation_needed || ""}\n` +
        `• Отбор: ${reportData.section4_trajectory.student_selection_correction || ""}\n` +
        `• Дополнение темами: ${reportData.section4_trajectory.added_topics_recommendation || ""}\n` +
        `• Объем часов: ${reportData.section4_trajectory.hours_correction_needed || ""}\n` +
        `• Формат: ${reportData.section4_trajectory.format_correction_needed || ""}\n` +
        `• Выводы:\n  - ${reportData.section4_trajectory.conclusions?.join("\n  - ") || ""}`
      : "";
    writeReportSection("Раздел 4. Траектория изменения программы (рекомендации)", trajectoryText);
  }

  doc.save(safeFileName(courseName, "pdf"));
}

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const escapeCsvCell = (value) => {
  const cell = String(value ?? "");
  return `"${cell.replace(/"/g, '""')}"`;
};

const toCsvRow = (values) => values.map(escapeCsvCell).join(",");

const styleWorksheetHeader = (worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2F6F65" },
  };
  headerRow.alignment = { vertical: "middle", wrapText: true };
};

export async function exportReportToXlsx(report) {
  const ExcelJS = (await import("exceljs")).default;
  const courseAnalysis = report.result?.courses_analysis?.[0];
  const exportDate = formatExportDate();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "НейроЭксперт";
  workbook.created = new Date();

  const courseName = courseAnalysis?.course_name || report.course || "Электронный курс";
  const period = courseAnalysis?.period || "Не указан";
  const studentsCount = courseAnalysis?.students_count || 0;

  // Sheet 1: Summary
  const summarySheet = workbook.addWorksheet("Общая сводка");
  summarySheet.columns = [
    { header: "Показатель", key: "field", width: 25 },
    { header: "Значение", key: "value", width: 80 },
  ];
  summarySheet.addRows([
    { field: "Курс", value: courseName },
    { field: "Период", value: period },
    { field: "Количество слушателей", value: studentsCount },
    { field: "Сервис аналитики", value: "НейроЭксперт" },
    { field: "Дата выгрузки", value: exportDate },
  ]);

  // Sheet 2: Quantitative Stats
  const statsSheet = workbook.addWorksheet("Количественные оценки");
  statsSheet.columns = [
    { header: "Критерий", key: "criterion", width: 25 },
    { header: "Средний балл", key: "avg", width: 15 },
    { header: "Медиана", key: "med", width: 12 },
    { header: "Станд. отклонение", key: "std", width: 18 },
    { header: "Оценки 1-3 (%)", key: "low", width: 15 },
    { header: "Оценки 4-7 (%)", key: "mid", width: 15 },
    { header: "Оценки 8-10 (%)", key: "high", width: 15 },
  ];

  const stats = courseAnalysis?.statistics;
  if (stats) {
    const addMetricRow = (name, m) => {
      if (!m) return;
      statsSheet.addRow({
        criterion: name,
        avg: m.average,
        med: m.median,
        std: m.std_dev,
        low: m.distribution?.low,
        mid: m.distribution?.mid,
        high: m.distribution?.high
      });
    };
    addMetricRow("Полезность", stats.usefulness);
    addMetricRow("Практико-ориентированность", stats.practicality);
    addMetricRow("Доступность материала", stats.accessibility);
    addMetricRow("Взаимодействие с КУ", stats.interaction);
  }

  // Sheet 3: Qualitative
  const qualSheet = workbook.addWorksheet("Качественный анализ");
  qualSheet.columns = [
    { header: "Элемент", key: "type", width: 15 },
    { header: "Название / Текст", key: "name", width: 50 },
    { header: "Метрика / Частота", key: "metric", width: 20 },
    { header: "Детали / Описание", key: "desc", width: 80 },
  ];

  const textAnalysis = courseAnalysis?.text_analysis;
  if (textAnalysis) {
    if (textAnalysis.sentiment) {
      qualSheet.addRow({
        type: "Тональность",
        name: "Позитив / Нейтрал / Негатив (%)",
        metric: `${textAnalysis.sentiment.positive}% / ${textAnalysis.sentiment.neutral}% / ${textAnalysis.sentiment.negative}%`,
        desc: "Общая эмоциональная окраска комментариев слушателей."
      });
    }
    textAnalysis.top_topics?.forEach((t) => {
      qualSheet.addRow({
        type: "Тема",
        name: t.topic,
        metric: `Частота: ${t.frequency}`,
        desc: t.description
      });
    });
    textAnalysis.key_problems?.forEach((p) => {
      qualSheet.addRow({
        type: "Проблема",
        name: p.problem,
        metric: `Уровень: ${p.severity}`,
        desc: `Упоминается в ${p.frequency_percent}% отзывов.`
      });
    });
    textAnalysis.recommendations?.forEach((r) => {
      qualSheet.addRow({
        type: "Рекомендация",
        name: r.target,
        metric: `Приоритет: ${r.priority}`,
        desc: r.action_item
      });
    });
    textAnalysis.quotes?.forEach((q) => {
      qualSheet.addRow({
        type: "Цитата",
        name: q.quote,
        metric: `Повторов: ${q.frequency}`,
        desc: "Репрезентативное высказывание слушателя."
      });
    });
  }

  // Sheet 4: Analytical report
  const repSheet = workbook.addWorksheet("Аналитическая справка");
  repSheet.columns = [
    { header: "Раздел", key: "section", width: 30 },
    { header: "Содержание", key: "content", width: 110 },
  ];

  const reportData = courseAnalysis?.analytical_report;
  if (reportData) {
    repSheet.addRow({
      section: "Раздел 1. Общая информация",
      content: reportData.section1_general_info
    });

    const keyCriteriaText = reportData.section2_key_criteria
      ? `Полезность: ${reportData.section2_key_criteria.usefulness_summary || ""}\n` +
        `Практика: ${reportData.section2_key_criteria.practicality_summary || ""}\n` +
        `Доступность: ${reportData.section2_key_criteria.accessibility_summary || ""}\n` +
        `Взаимодействие: ${reportData.section2_key_criteria.interaction_summary || ""}\n` +
        `Вовлеченность: ${reportData.section2_key_criteria.involvement_summary || ""}`
      : "";
    repSheet.addRow({
      section: "Раздел 2. Ключевые критерии",
      content: keyCriteriaText
    });

    const suggestionsText = reportData.section3_suggestions
      ? `Исключить темы: ${reportData.section3_suggestions.unwanted_topics?.join(", ") || ""}\n` +
        `Добавить темы: ${reportData.section3_suggestions.added_topics?.map(t => `${t.topic} (${t.count})`).join("; ") || ""}\n` +
        `Формат обучения: ${reportData.section3_suggestions.preferred_format_summary || ""}`
      : "";
    repSheet.addRow({
      section: "Раздел 3. Предложения слушателей",
      content: suggestionsText
    });

    const trajectoryText = reportData.section4_trajectory
      ? `Дальнейшая реализация: ${reportData.section4_trajectory.further_implementation_needed || ""}\n` +
        `Корректировка отбора: ${reportData.section4_trajectory.student_selection_correction || ""}\n` +
        `Дополнение темами: ${reportData.section4_trajectory.added_topics_recommendation || ""}\n` +
        `Корректировка часов: ${reportData.section4_trajectory.hours_correction_needed || ""}\n` +
        `Формат занятий: ${reportData.section4_trajectory.format_correction_needed || ""}\n` +
        `Выводы: ${reportData.section4_trajectory.conclusions?.join("; ") || ""}`
      : "";
    repSheet.addRow({
      section: "Раздел 4. Траектория изменений",
      content: trajectoryText
    });
  }

  [summarySheet, statsSheet, qualSheet, repSheet].forEach((worksheet) => {
    styleWorksheetHeader(worksheet);
    worksheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    safeFileName(courseName, "xlsx")
  );
}

const createTextParagraphs = (value) => {
  const lines = String(value || "Нет данных").split("\n");
  return lines.map((line) =>
    new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: line || " ",
          size: 22,
        }),
      ],
      spacing: { after: 120 },
    })
  );
};

const createBulletParagraph = (text) =>
  new docx.Paragraph({
    children: [new docx.TextRun({ text, size: 22 })],
    bullet: { level: 0 },
    spacing: { after: 100 },
  });

let docx = null;

async function loadDocx() {
  if (!docx) {
    docx = await import("docx");
  }
  return docx;
}

const createDocxHeading = (text, level = 1) =>
  new docx.Paragraph({
    text,
    heading: level === 1 ? docx.HeadingLevel.HEADING_1 : docx.HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 160 },
  });

const createDocxTable = (headers, rows) =>
  new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    rows: [
      new docx.TableRow({
        children: headers.map((header) =>
          new docx.TableCell({
            children: [
              new docx.Paragraph({
                children: [new docx.TextRun({ text: header, bold: true, size: 20 })],
              }),
            ],
            shading: { fill: "E5F2EC" },
          })
        ),
      }),
      ...rows.map((row) =>
        new docx.TableRow({
          children: row.map((cell) =>
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  children: [new docx.TextRun({ text: String(cell ?? "-"), size: 20 })],
                }),
              ],
            })
          ),
        })
      ),
    ],
  });

export async function exportReportToDocx(report) {
  await loadDocx();

  const courseAnalysis = report.result?.courses_analysis?.[0];
  const courseName = courseAnalysis?.course_name || report.course || "Электронный курс";
  const period = courseAnalysis?.period || "Не указан";
  const studentsCount = courseAnalysis?.students_count || 0;
  const stats = courseAnalysis?.statistics;
  const reportData = courseAnalysis?.analytical_report;

  const statisticRows = [];
  const addMetricRow = (name, metric) => {
    if (!metric) return;
    statisticRows.push([
      name,
      metric.average?.toFixed?.(1) || "-",
      metric.median?.toFixed?.(1) || "-",
      metric.std_dev?.toFixed?.(1) || "-",
      metric.distribution
        ? `1-3: ${metric.distribution.low?.toFixed?.(0) || 0}%; 4-7: ${metric.distribution.mid?.toFixed?.(0) || 0}%; 8-10: ${metric.distribution.high?.toFixed?.(0) || 0}%`
        : "-",
    ]);
  };

  addMetricRow("Полезность", stats?.usefulness);
  addMetricRow("Практико-ориентированность", stats?.practicality);
  addMetricRow("Доступность", stats?.accessibility);
  addMetricRow("Взаимодействие с КУ", stats?.interaction);
  if (stats?.involvement) {
    statisticRows.push([
      "Вовлеченность",
      `${stats.involvement.involved_percent?.toFixed?.(0) || 0}%`,
      "-",
      "-",
      `Отстранены: ${stats.involvement.detached_percent?.toFixed?.(0) || 0}%; да: ${stats.involvement.yes_count}; нет: ${stats.involvement.no_count}`,
    ]);
  }

  const keyCriteria = reportData?.section2_key_criteria;
  const suggestions = reportData?.section3_suggestions;
  const trajectory = reportData?.section4_trajectory;

  const children = [
    new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: "Аналитическая справка по итогам анкетирования",
          bold: true,
          size: 32,
        }),
      ],
      spacing: { after: 160 },
    }),
    new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: `${courseName} | Период: ${period} | Слушателей: ${studentsCount} | Выгружено: ${formatExportDate()}`,
          size: 20,
        }),
      ],
      spacing: { after: 240 },
    }),
    createDocxHeading("1. Общая информация о программе"),
    ...createTextParagraphs(reportData?.section1_general_info),
    createDocxHeading("2. Ключевые критерии по программе"),
    createDocxTable(
      ["Критерий", "Средний балл", "Медиана", "Станд. отклонение", "Распределение"],
      statisticRows.length ? statisticRows : [["Нет данных", "-", "-", "-", "-"]]
    ),
    createBulletParagraph(`Полезность: ${keyCriteria?.usefulness_summary || "Нет данных"}`),
    createBulletParagraph(`Практико-ориентированность: ${keyCriteria?.practicality_summary || "Нет данных"}`),
    createBulletParagraph(`Доступность: ${keyCriteria?.accessibility_summary || "Нет данных"}`),
    createBulletParagraph(`Взаимодействие с КУ: ${keyCriteria?.interaction_summary || "Нет данных"}`),
    createBulletParagraph(`Вовлеченность: ${keyCriteria?.involvement_summary || "Нет данных"}`),
    createDocxHeading("3. Предложения слушателей"),
    createBulletParagraph(`Темы к исключению: ${suggestions?.unwanted_topics?.join(", ") || "нет"}`),
    createBulletParagraph(
      `Темы к добавлению: ${
        suggestions?.added_topics?.map((topic) => `${topic.topic} (${topic.count})`).join("; ") || "нет"
      }`
    ),
    createBulletParagraph(`Предпочтительный формат: ${suggestions?.preferred_format_summary || "Нет данных"}`),
    createDocxHeading("4. Траектория изменения программы"),
    createBulletParagraph(`Потребность в дальнейшей реализации: ${trajectory?.further_implementation_needed || "Нет данных"}`),
    createBulletParagraph(`Корректировка отбора слушателей: ${trajectory?.student_selection_correction || "Нет данных"}`),
    createBulletParagraph(`Дополнение программы учебными вопросами: ${trajectory?.added_topics_recommendation || "Нет данных"}`),
    createBulletParagraph(`Изменение количества часов: ${trajectory?.hours_correction_needed || "Нет данных"}`),
    createBulletParagraph(`Изменение формы обучения: ${trajectory?.format_correction_needed || "Нет данных"}`),
    createDocxHeading("Выводы", 2),
    ...(trajectory?.conclusions?.length
      ? trajectory.conclusions.map((conclusion) => createBulletParagraph(conclusion))
      : [createBulletParagraph("Нет данных")]),
  ];

  const document = new docx.Document({
    creator: "НейроЭксперт",
    title: courseName,
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await docx.Packer.toBlob(document);
  downloadBlob(blob, safeFileName(courseName, "docx"));
}

export function exportReportToCsv(report) {
  const courseAnalysis = report.result?.courses_analysis?.[0];
  const exportDate = formatExportDate();
  const courseName = courseAnalysis?.course_name || report.course || "Электронный курс";
  const period = courseAnalysis?.period || "Не указан";
  const studentsCount = courseAnalysis?.students_count || 0;

  const rows = [
    ["Общая сводка по опросу"],
    ["Параметр", "Значение"],
    ["Курс", courseName],
    ["Период", period],
    ["Слушатели", studentsCount],
    ["Выгружено", exportDate],
    [],
    ["Количественные показатели"],
    ["Критерий", "Средний балл", "Медиана", "Отклонение"],
  ];

  const stats = courseAnalysis?.statistics;
  if (stats) {
    const addCsvRow = (name, m) => {
      if (!m) return;
      rows.push([name, m.average.toFixed(2), m.median.toFixed(0), m.std_dev.toFixed(2)]);
    };
    addCsvRow("Полезность", stats.usefulness);
    addCsvRow("Практичность", stats.practicality);
    addCsvRow("Доступность", stats.accessibility);
    addCsvRow("Взаимодействие", stats.interaction);
  }

  const csv = `\uFEFF${rows.map(toCsvRow).join("\n")}`;
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), safeFileName(courseName, "csv"));
}

export function exportReportToJson(report) {
  downloadBlob(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" }),
    safeFileName(report.course, "json")
  );
}
