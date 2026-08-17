const numericMetricKeys = [
  {
    key: "usefulness",
    label: "Полезность",
    shortLabel: "Полезность",
    summaryKey: "usefulness_summary",
  },
  {
    key: "practicality",
    label: "Практико-ориентированность",
    shortLabel: "Практика",
    summaryKey: "practicality_summary",
  },
  {
    key: "accessibility",
    label: "Доступность",
    shortLabel: "Доступность",
    summaryKey: "accessibility_summary",
  },
  {
    key: "interaction",
    label: "Взаимодействие с КУ",
    shortLabel: "Взаимодействие",
    summaryKey: "interaction_summary",
  },
];

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const formatPercent = (value) => `${toNumber(value).toFixed(0)}%`;

const getMetricValue = (metric, field) => {
  if (!metric || metric[field] === undefined || metric[field] === null) return null;
  return toNumber(metric[field], null);
};

const normalizeDistribution = (distribution) => ({
  low: toNumber(distribution?.low),
  mid: toNumber(distribution?.mid),
  high: toNumber(distribution?.high),
});

const averageNumbers = (values) => {
  const validValues = values.filter((value) => Number.isFinite(value));
  if (!validValues.length) return null;
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
};

export const getCourseAnalysis = (report) => {
  if (!report) return null;
  let res = report.result || report;
  if (typeof res === "string") {
    try {
      res = JSON.parse(res);
    } catch (e) {
      console.error("Failed to parse report.result JSON string:", e);
      return null;
    }
  }
  if (res?.courses_analysis?.[0]) return res.courses_analysis[0];
  if (res?.CoursesAnalysis?.[0]) return res.CoursesAnalysis[0];
  if (res?.coursesAnalysis?.[0]) return res.coursesAnalysis[0];
  if (res?.statistics || res?.Statistics) return res;
  return null;
};

export function buildCourseReportViewModel(report) {
  const courseAnalysis = getCourseAnalysis(report);
  const statistics = courseAnalysis?.statistics || courseAnalysis?.Statistics || null;
  const reportData = courseAnalysis?.analytical_report || courseAnalysis?.AnalyticalReport || null;
  const textAnalysis = courseAnalysis?.text_analysis || courseAnalysis?.TextAnalysis || null;
  const dashboardData = courseAnalysis?.dashboard_data || courseAnalysis?.DashboardData || {};
  const involvement = statistics?.involvement || statistics?.Involvement || null;

  const metricCards = numericMetricKeys.map((metricDefinition) => {
    const metric = statistics?.[metricDefinition.key] || statistics?.[metricDefinition.key.charAt(0).toUpperCase() + metricDefinition.key.slice(1)] || null;
    const distribution = normalizeDistribution(metric?.distribution || metric?.Distribution);

    return {
      ...metricDefinition,
      metric,
      average: getMetricValue(metric, "average") ?? getMetricValue(metric, "Average"),
      median: getMetricValue(metric, "median") ?? getMetricValue(metric, "Median"),
      stdDev: getMetricValue(metric, "std_dev") ?? getMetricValue(metric, "StdDev"),
      distribution,
      summary: reportData?.section2_key_criteria?.[metricDefinition.summaryKey] || reportData?.Section2KeyCriteria?.[metricDefinition.summaryKey] || "",
    };
  });

  const numericAverages = metricCards.map((card) => card.average);
  const overallSatisfaction = averageNumbers(numericAverages);
  const overallDistribution = {
    low: averageNumbers(metricCards.map((card) => card.distribution.low)) || 0,
    mid: averageNumbers(metricCards.map((card) => card.distribution.mid)) || 0,
    high: averageNumbers(metricCards.map((card) => card.distribution.high)) || 0,
  };

  const involvementChartMetric = {
    key: "involvement",
    label: "Вовлеченность",
    shortLabel: "Вовлеченность",
    average: involvement ? toNumber(involvement.involved_percent) / 10 : null,
    originalPercent: involvement ? toNumber(involvement.involved_percent) : null,
  };

  const fiveCriteria = [
    ...metricCards.map((card) => ({
      key: card.key,
      label: card.shortLabel,
      value: card.average,
      displayValue: card.average === null ? "-" : card.average.toFixed(1),
    })),
    {
      key: involvementChartMetric.key,
      label: involvementChartMetric.shortLabel,
      value: involvementChartMetric.average,
      displayValue:
        involvementChartMetric.originalPercent === null
          ? "-"
          : `${formatPercent(involvementChartMetric.originalPercent)} (${involvementChartMetric.average.toFixed(1)}/10)`,
    },
  ];

  return {
    courseAnalysis,
    statistics,
    reportData,
    textAnalysis,
    dashboardData,
    courseName: courseAnalysis?.course_name || report?.course || "Электронный курс",
    period: courseAnalysis?.period || "Не указан",
    studentsCount: toNumber(courseAnalysis?.students_count),
    positionDistribution: courseAnalysis?.position_distribution || {},
    preferredFormats: courseAnalysis?.preferred_formats || {},
    metricCards,
    fiveCriteria,
    overallSatisfaction,
    overallDistribution,
    involvement,
    limitations: {
      exactScoreDistribution:
        "Backend пока не передает абсолютные корзины оценок 1-10; frontend показывает агрегированные проценты 1-3 / 4-7 / 8-10.",
      sourceEvidence:
        "точные номера строк и вопросов недоступны до расширения backend-контракта.",
    },
  };
}
