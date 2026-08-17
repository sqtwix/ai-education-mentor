export const isOfflineMode =
  String(import.meta.env.VITE_OFFLINE_MODE || "").toLowerCase() === "true";

const OFFLINE_REPORTS_KEY = "educheck_offline_reports";
const OFFLINE_TASKS_KEY = "educheck_offline_tasks";
const OFFLINE_STUDENTS_DEMO_SEED_KEY = "educheck_offline_students_demo_seed_v1";

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Check if we are running in local Vite development mode
  if (window.location.port === "5173") {
    return "http://127.0.0.1:5000/api/v1";
  }
  // Fallback to relative path for production proxying
  return "/api/v1";
};

const API_BASE_URL = getApiBaseUrl();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJson = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const stripExtension = (fileName) => fileName.replace(/\.[^/.]+$/, "");

const normalizeOfflineReport = (report) => ({
  id: String(report.id),
  course: report.course || "Электронный курс",
  title: report.title || "Локальный демо-отчет",
  errors: Array.isArray(report.errors) ? report.errors : [],
  recommendations: Array.isArray(report.recommendations) ? report.recommendations : [],
  status: report.status || "Completed",
  error: report.error || "",
  isArchived: Boolean(report.isArchived),
  createdAt: report.createdAt || new Date().toISOString(),
  updatedAt: report.updatedAt || new Date().toISOString(),
  result: report.result || null,
});

const getOfflineReports = () => readJson(OFFLINE_REPORTS_KEY, []).map(normalizeOfflineReport);

const saveOfflineReports = (reports) => {
  writeJson(OFFLINE_REPORTS_KEY, reports.map(normalizeOfflineReport));
};

const getOfflineTasks = () => readJson(OFFLINE_TASKS_KEY, {});

const saveOfflineTasks = (tasks) => {
  writeJson(OFFLINE_TASKS_KEY, tasks);
};

const generateOfflineReport = ({ taskId, userResponseFiles, modelType }) => {
  const firstResponseName = stripExtension(userResponseFiles[0]?.name || "Применение инструментов ИИ в гос управлении");
  const courseName = firstResponseName.replace(/^\d{2}\.\d{2}-\d{2}\.\d{2}\s+/, "");
  const period = firstResponseName.match(/^\d{2}\.\d{2}-\d{2}\.\d{2}/)?.[0] || "12.05-25.05";

  return normalizeOfflineReport({
    id: taskId,
    course: courseName,
    title: `Анализ опроса за период ${period}`,
    status: "Completed",
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    result: {
      batch_id: taskId,
      courses_analysis: [
        {
          course_name: courseName,
          period: period,
          students_count: 42,
          statistics: {
            usefulness: {
              average: 8.4,
              median: 9.0,
              std_dev: 1.2,
              distribution: { low: 5.0, mid: 25.0, high: 70.0 }
            },
            practicality: {
              average: 7.9,
              median: 8.0,
              std_dev: 1.5,
              distribution: { low: 10.0, mid: 30.0, high: 60.0 }
            },
            accessibility: {
              average: 9.1,
              median: 10.0,
              std_dev: 0.8,
              distribution: { low: 2.0, mid: 18.0, high: 80.0 }
            },
            interaction: {
              average: 8.8,
              median: 9.0,
              std_dev: 1.1,
              distribution: { low: 4.0, mid: 21.0, high: 75.0 }
            },
            involvement: {
              detached_percent: 15.0,
              involved_percent: 85.0,
              yes_count: 6,
              no_count: 36
            }
          },
          position_distribution: {
            "Специалист": 28,
            "Руководитель": 10,
            "Обеспечивающий специалист": 4
          },
          preferred_formats: {
            "очное обучение в аудиториях Корпоративного университета": 20,
            "смешанное обучение: частично очно, частично дистанционно": 18,
            "полностью дистанционный формат обучения": 4
          },
          analytical_report: {
            section1_general_info: `Программа: ${courseName}\nПериод проведения: ${period}\nСлушатели: 42 человека (из них 28 специалистов, 10 руководителей, 4 обеспечивающих специалиста).\nПреподаватели: Николай Иванов, Ольга Смирнова.`,
            section2_key_criteria: {
              usefulness_summary: "Слушатели высоко оценили полезность программы (средний балл 8.4). Основной интерес вызвали темы практического использования ИИ для создания презентаций и автоматизации рутины.",
              practicality_summary: "Практико-ориентированность оценена на 7.9 балла. Большинство отметило полезность разбора реальных рабочих ситуаций, однако часть аудитории просит увеличить время на самостоятельную работу за ПК.",
              accessibility_summary: "Максимальная оценка у доступности материала (9.1 балла). Логика построения тем названа последовательной и понятной.",
              interaction_summary: "Взаимодействие с командой КУ оценено на 8.8 балла. Слушатели отметили высокую отзывчивость и быстрое решение возникающих вопросов.",
              involvement_summary: "Вовлеченность составила 85%. Лишь 15% (6 человек) указали на частичную отстраненность во время теоретического блока от Сбера."
            },
            section3_suggestions: {
              unwanted_topics: [
                "Обзорная лекция по истории ИИ",
                "Теоретические основы нейросетей от Сбера (повтор пройденного)"
              ],
              added_topics: [
                { topic: "Написание продвинутых промптов для работы с документами", count: 8 },
                { topic: "Автоматизация создания табличных отчетов через ИИ", count: 5 }
              ],
              preferred_format_summary: "Слушатели разделились во мнениях: 20 человек предпочитают классический очный формат, 18 человек высказались за смешанное обучение."
            },
            section4_trajectory: {
              further_implementation_needed: "Программа крайне востребована (балл полезности 8.4). Рекомендуется продолжать реализацию с учетом доработок.",
              student_selection_correction: "Рекомендуется более тщательно отбирать слушателей по уровню цифровых навыков, так как некоторые испытывали трудности на практике.",
              added_topics_recommendation: "Необходимо добавить 4 часа на изучение продвинутого промптинга для документов.",
              hours_correction_needed: "Требуется увеличить общую продолжительность курса с 16 до 24 часов за счет добавления практических часов.",
              format_correction_needed: "Оптимальным решением будет смешанный формат обучения (Blended Learning) с практическими сессиями в классах.",
              conclusions: [
                "Программа имеет высокий потенциал практического применения в госслужбе.",
                "Слабым местом является теоретический блок Сбера (жалобы на скучное изложение).",
                "Необходимо сместить баланс в сторону практических кейсов."
              ]
            }
          },
          dashboard_data: {
            correlation_matrix: {
              "Полезность": { "Полезность": 1.0, "Практика": 0.78, "Доступность": 0.65, "Взаимодействие": 0.45 },
              "Практика": { "Полезность": 0.78, "Практика": 1.0, "Доступность": 0.54, "Взаимодействие": 0.32 },
              "Доступность": { "Полезность": 0.65, "Практика": 0.54, "Доступность": 1.0, "Взаимодействие": 0.51 },
              "Взаимодействие": { "Полезность": 0.45, "Практика": 0.32, "Доступность": 0.51, "Взаимодействие": 1.0 }
            },
            trend_data: [
              { period: "март 2026", usefulness_avg: 8.0, practicality_avg: 7.5, accessibility_avg: 8.8, interaction_avg: 8.5, involvement_avg: 80.0 },
              { period: "апрель 2026", usefulness_avg: 8.2, practicality_avg: 7.7, accessibility_avg: 9.0, interaction_avg: 8.6, involvement_avg: 82.0 },
              { period: "май 2026", usefulness_avg: 8.4, practicality_avg: 7.9, accessibility_avg: 9.1, interaction_avg: 8.8, involvement_avg: 85.0 }
            ]
          },
          text_analysis: {
            top_topics: [
              { topic: "Создание презентаций через ИИ", description: "Использование нейросетей для верстки слайдов и структуры презентаций.", frequency: 15 },
              { topic: "Автоматизация ответов гражданам", description: "Создание текстовых черновиков ответов на обращения в ведомство.", frequency: 12 },
              { topic: "Генерация графических материалов", description: "Создание уникальных картинок для докладов через графические сети.", frequency: 8 }
            ],
            sentiment: { positive: 70.0, neutral: 20.0, negative: 10.0 },
            key_problems: [
              { problem: "Мало практических занятий за ПК", frequency_percent: 32.0, severity: "High" },
              { problem: "Скучное изложение теории от Сбера", frequency_percent: 18.0, severity: "Medium" }
            ],
            quotes: [
              { quote: "Было актуально изучить создание презентаций с помощью ИИ, так как это ускоряет процесс их создания.", frequency: 4 },
              { quote: "Хочется больше практики непосредственно в различных моделиях искусственного интеллекта.", frequency: 3 }
            ],
            recommendations: [
              { target: "Теория", action_item: "Заменить или доработать блок лекций от Сбера, улучшить интерактивность.", priority: "Medium" },
              { target: "Практика", action_item: "Выделить больше часов для личной работы за ПК под руководством куратора.", priority: "High" }
            ]
          }
        }
      ]
    }
  });
};

const reportToApiResult = (report) => report.result;

export function seedOfflineReports(reports) {
  if (!isOfflineMode) return;

  const demoReports = reports.map(normalizeOfflineReport);
  const currentReports = getOfflineReports();

  if (currentReports.length === 0) {
    saveOfflineReports(demoReports);
    localStorage.setItem(OFFLINE_STUDENTS_DEMO_SEED_KEY, "true");
    return;
  }

  if (localStorage.getItem(OFFLINE_STUDENTS_DEMO_SEED_KEY)) return;

  const demoReportsById = new Map(demoReports.map((report) => [report.id, report]));
  const mergedReports = currentReports.map((report) => {
    const demoReport = demoReportsById.get(report.id);
    if (!demoReport) return report;

    const hasStudentDetails =
      Array.isArray(report.result?.student_detailed_analyses) &&
      report.result.student_detailed_analyses.length > 0;

    return hasStudentDetails ? report : demoReport;
  });

  const currentIds = new Set(mergedReports.map((report) => report.id));
  const missingDemoReports = demoReports.filter((report) => !currentIds.has(report.id));

  saveOfflineReports([...missingDemoReports, ...mergedReports]);
  localStorage.setItem(OFFLINE_STUDENTS_DEMO_SEED_KEY, "true");
}

export async function request(endpoint, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      localStorage.removeItem("userEmail");
      window.location.hash = "login";
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    let errorMsg = "Произошла ошибка при выполнении запроса";
    try {
      const errData = await response.json();
      errorMsg = errData.error || errData.message || errorMsg;
    } catch {
      // JSON parsing failed, try plain text
      try {
        const text = await response.text();
        if (text) errorMsg = text;
      } catch {
        // ignore
      }
    }
    throw new Error(errorMsg);
  }

  // Handle empty responses (like 204 No Content)
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function login(email, password) {
  if (isOfflineMode) {
    await delay(250);
    if (!email || !password) throw new Error("Заполните email и пароль.");
    return {
      token: `offline-token-${Date.now()}`,
      username: email.split("@")[0] || "offline-user",
    };
  }

  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(username, email, password) {
  if (isOfflineMode) {
    await delay(250);
    if (!username || !email || !password) throw new Error("Заполните все поля.");
    return {
      token: `offline-token-${Date.now()}`,
      username,
    };
  }

  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export async function uploadFiles(userResponseFiles, modelType) {
  if (isOfflineMode) {
    await delay(300);
    const taskId = `offline-${Date.now()}`;
    const report = generateOfflineReport({
      taskId,
      userResponseFiles,
      modelType,
    });
    const tasks = getOfflineTasks();
    tasks[taskId] = {
      id: taskId,
      status: "Processing",
      createdAt: Date.now(),
      report,
    };
    saveOfflineTasks(tasks);
    return {
      task_id: taskId,
      message: "Offline mode: файлы приняты в локальную обработку.",
    };
  }

  const formData = new FormData();
  userResponseFiles.forEach((file) => {
    formData.append("userResponseFiles", file);
  });
  formData.append("modelType", modelType.toLowerCase());

  return request("/analysis/upload", {
    method: "POST",
    body: formData,
  });
}

export async function getAnalysisStatus(taskId) {
  if (isOfflineMode) {
    await delay(400);
    const tasks = getOfflineTasks();
    const task = tasks[taskId];
    if (!task) {
      return { status: "Failed", error: "Offline task not found" };
    }

    if (Date.now() - task.createdAt < 1600) {
      return { status: "Processing" };
    }

    task.status = "Completed";
    tasks[taskId] = task;
    saveOfflineTasks(tasks);

    const reports = getOfflineReports();
    if (!reports.some((report) => report.id === taskId)) {
      saveOfflineReports([task.report, ...reports]);
    }

    return {
      status: "Completed",
      result: reportToApiResult(task.report),
    };
  }

  return request(`/analysis/status/${taskId}`);
}

export async function getAnalysisHistory(options = {}) {
  const { includeArchived = false, onlyArchived = false } = options;

  if (isOfflineMode) {
    await delay(120);
    return getOfflineReports().filter((report) => {
      if (onlyArchived) return report.isArchived;
      if (!includeArchived) return !report.isArchived;
      return true;
    });
  }

  const params = new URLSearchParams();
  if (includeArchived) params.set("includeArchived", "true");
  if (onlyArchived) params.set("onlyArchived", "true");
  const query = params.toString();

  return request(`/analysis/history${query ? `?${query}` : ""}`);
}

export async function renameAnalysisReport(taskId, newName) {
  if (isOfflineMode) {
    await delay(120);
    const reports = getOfflineReports();
    const nextReports = reports.map((report) =>
      report.id === taskId
        ? normalizeOfflineReport({ ...report, course: newName, updatedAt: new Date().toISOString() })
        : report
    );
    saveOfflineReports(nextReports);
    return nextReports.find((report) => report.id === taskId) || null;
  }

  return request(`/analysis/rename/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ name: newName }),
  });
}

export async function createOfflineReport(report) {
  if (!isOfflineMode) throw new Error("Создание локального отчета доступно только в offline mode.");
  await delay(120);
  const nextReport = normalizeOfflineReport({
    id: `manual-${Date.now()}`,
    ...report,
  });
  saveOfflineReports([nextReport, ...getOfflineReports()]);
  return nextReport;
}

export async function updateOfflineReport(reportId, patch) {
  if (!isOfflineMode) throw new Error("Редактирование локального отчета доступно только в offline mode.");
  await delay(80);
  let updatedReport = null;
  const reports = getOfflineReports().map((report) => {
    if (report.id !== reportId) return report;
    updatedReport = normalizeOfflineReport({
      ...report,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    return updatedReport;
  });
  saveOfflineReports(reports);
  return updatedReport;
}

export async function archiveAnalysisReport(reportId) {
  if (isOfflineMode) {
    await delay(80);
    saveOfflineReports(getOfflineReports().map((report) =>
      report.id === reportId
        ? normalizeOfflineReport({ ...report, isArchived: true, updatedAt: new Date().toISOString() })
        : report
    ));
    return null;
  }

  return request(`/analysis/archive/${reportId}`, {
    method: "PUT",
  });
}

export async function unarchiveAnalysisReport(reportId) {
  if (isOfflineMode) {
    await delay(80);
    saveOfflineReports(getOfflineReports().map((report) =>
      report.id === reportId
        ? normalizeOfflineReport({ ...report, isArchived: false, updatedAt: new Date().toISOString() })
        : report
    ));
    return null;
  }

  return request(`/analysis/unarchive/${reportId}`, {
    method: "PUT",
  });
}

export async function getUserSettings() {
  if (isOfflineMode) return null;
  return request("/user/settings");
}

export async function saveUserSettings(settings) {
  if (isOfflineMode) return null;
  return request("/user/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
