export const isOfflineMode =
  String(import.meta.env.VITE_OFFLINE_MODE || "").toLowerCase() === "true";

const OFFLINE_REPORTS_KEY = "educheck_offline_reports";
const OFFLINE_TASKS_KEY = "educheck_offline_tasks";
const OFFLINE_STUDENTS_DEMO_SEED_KEY = "educheck_offline_students_demo_seed_v1";

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (window.location.port === "5173") {
    return "http://127.0.0.1:5000/api/v1";
  }
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

const normalizeOfflineReport = (report) => ({
  id: String(report.id),
  course: report.course || "Индивидуальная образовательная траектория",
  title: report.title || "Индивидуальная образовательная траектория",
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

export function seedOfflineReports(reports = []) {
  const current = getOfflineReports();
  if (current.length === 0 && reports.length > 0) {
    saveOfflineReports(reports.map(normalizeOfflineReport));
  }
}

export async function createOfflineReport(report) {
  const next = normalizeOfflineReport({
    id: `manual-${Date.now()}`,
    ...report,
  });
  saveOfflineReports([next, ...getOfflineReports()]);
  return next;
}

export async function updateOfflineReport(reportId, patch) {
  let updated = null;
  const reports = getOfflineReports().map((r) => {
    if (r.id !== reportId) return r;
    updated = normalizeOfflineReport({
      ...r,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    return updated;
  });
  saveOfflineReports(reports);
  return updated;
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
      try {
        const text = await response.text();
        if (text) errorMsg = text;
      } catch {
        // ignore
      }
    }
    throw new Error(errorMsg);
  }

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

// Генерация индивидуальной траектории обучения (ИОТ)
export async function generateTrajectory(employee, modelType = "deepseek") {
  if (isOfflineMode) {
    await delay(500);
    const taskId = `offline-traj-${Date.now()}`;
    return {
      task_id: taskId,
      message: "Offline mode: генерация траектории запущена.",
    };
  }

  return request("/analysis/generate-trajectory", {
    method: "POST",
    body: JSON.stringify({
      employee,
      model_type: modelType
    })
  });
}

// Загрузка реестров и файлов истории
export async function uploadFiles(userResponseFiles, modelType = "deepseek") {
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

// Получить каталог 221 курса 2025 года
export async function getCoursesCatalog() {
  return request("/analysis/catalog");
}

// Получить пользователей из истории обучения для быстрого выбора
export async function getHistoryUsers() {
  return request("/analysis/users");
}

// Получить бенчмарки и статистику по должностям
export async function getBenchmarks() {
  return request("/analysis/benchmarks");
}

export async function getAnalysisStatus(taskId) {
  return request(`/analysis/status/${taskId}`);
}

export async function getAnalysisHistory(options = {}) {
  const { includeArchived = false, onlyArchived = false } = options;
  const params = new URLSearchParams();
  if (includeArchived) params.set("includeArchived", "true");
  if (onlyArchived) params.set("onlyArchived", "true");
  const query = params.toString();

  return request(`/analysis/history${query ? `?${query}` : ""}`);
}

export async function renameAnalysisReport(taskId, newName) {
  return request(`/analysis/rename/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({ name: newName }),
  });
}

export async function archiveAnalysisReport(reportId) {
  return request(`/analysis/archive/${reportId}`, {
    method: "PUT",
  });
}

export async function unarchiveAnalysisReport(reportId) {
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
