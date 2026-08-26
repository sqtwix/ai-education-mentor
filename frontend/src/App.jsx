import { lazy, Suspense, useCallback, useState, useEffect, useRef } from "react";
import { Clock3, XCircle } from "lucide-react";
import {
  login,
  register,
  getAnalysisHistory,
  renameAnalysisReport,
  isOfflineMode,
  isAuthExpiredError,
  seedOfflineReports,
  archiveAnalysisReport,
  unarchiveAnalysisReport,
  getAnalysisStatus,
} from "./api";
import { AppLayout } from "./components/Layout";
import { AccessibilityToolbar } from "./components/AccessibilityToolbar";
import { ConfirmDialog, ToastStack } from "./components/Feedback";
import { loadUserSettings, persistUserSettings, readLocalSettings } from "./settingsService";
import { getSidebarMaxWidth, layoutLimits, readLayoutPreferences, writeLayoutPreferences } from "./layoutPreferences";
import {
  exportReportToJson,
  exportReportToPdf,
  exportReportToXlsx,
} from "./reportExport";

const initialMockReports = [];

const chunkReloadKey = "iot:chunk-reload";

function ChunkLoadError() {
  return (
    <div className="state-panel" role="alert">
      <span className="state-icon state-icon-warm">
        <XCircle size={28} strokeWidth={2.2} />
      </span>
      <h2>Раздел не загрузился</h2>
      <p className="muted">Обновите страницу и повторите действие.</p>
      <button className="primary-button state-action" type="button" onClick={() => window.location.reload()}>
        Обновить страницу
      </button>
    </div>
  );
}

const lazyNamed = (loader, exportName) => lazy(async () => {
  try {
    const module = await loader();
    sessionStorage.removeItem(chunkReloadKey);
    return { default: module[exportName] };
  } catch {
    if (sessionStorage.getItem(chunkReloadKey) !== exportName) {
      sessionStorage.setItem(chunkReloadKey, exportName);
      window.location.reload();
      return new Promise(() => {});
    }

    sessionStorage.removeItem(chunkReloadKey);
    return { default: ChunkLoadError };
  }
});

const AuthPage = lazyNamed(() => import("./components/Pages"), "AuthPage");
const SettingsPage = lazyNamed(() => import("./components/Pages"), "SettingsPage");
const StudentsPage = lazyNamed(() => import("./components/Pages"), "StudentsPage");
const CourseReportDetailPage = lazyNamed(() => import("./components/Pages"), "CourseReportDetailPage");
const TrajectoryConstructor = lazyNamed(() => import("./components/TrajectoryConstructor"), "TrajectoryConstructor");
const CatalogExplorer = lazyNamed(() => import("./components/CatalogExplorer"), "CatalogExplorer");
const ColleagueAnalytics = lazyNamed(() => import("./components/ColleagueAnalytics"), "ColleagueAnalytics");

const pageLoadingFallback = (
  <div className="state-panel" role="status" aria-live="polite">
    <p className="muted">Загрузка раздела…</p>
  </div>
);

function App() {
  const [route, setRoute] = useState(() => {
    const initialRoute = window.location.hash.replace("#", "") || "upload";
    const isAuthRoute = initialRoute === "login" || initialRoute === "register";
    const hasToken = !!localStorage.getItem("token");
    if (!hasToken && !isAuthRoute) return "login";
    if (hasToken && isAuthRoute) return "upload";
    return initialRoute;
  });
  const [mockReports, setMockReports] = useState([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [toasts, setToasts] = useState([]);
  const [archiveTargetId, setArchiveTargetId] = useState("");
  const [archivedReports, setArchivedReports] = useState([]);
  const [userSettings, setUserSettings] = useState(() => readLocalSettings());
  const [layoutPreferences, setLayoutPreferences] = useState(() => readLayoutPreferences());
  const [systemThemeTick, setSystemThemeTick] = useState(0);
  const [taskProgress, setTaskProgress] = useState(null);
  const [historyLoadError, setHistoryLoadError] = useState("");
  const [archiveLoadError, setArchiveLoadError] = useState("");

  // Authentication states
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => localStorage.getItem("username") || "");
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("userEmail") || "");
  const [authError, setAuthError] = useState("");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  // Login form states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form states
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const saveActionsRef = useRef(null);
  const profileActionsRef = useRef(null);
  const userSettingsRef = useRef(userSettings);
  const settingsRequestRef = useRef(0);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  const updateLayoutPreferences = (patch) => {
    setLayoutPreferences((currentPreferences) => ({
      ...currentPreferences,
      ...patch,
    }));
  };

  const handleMainSidebarToggle = () => {
    updateLayoutPreferences({
      isMainSidebarCollapsed: !layoutPreferences.isMainSidebarCollapsed,
    });
  };

  const handleSettingsSidebarToggle = () => {
    updateLayoutPreferences({
      isSettingsSidebarCollapsed: !layoutPreferences.isSettingsSidebarCollapsed,
    });
  };

  const handleSidebarResizeStart = (panel, event) => {
    if (window.matchMedia?.("(max-width: 980px)")?.matches) return;

    event.preventDefault();
    const limits = layoutLimits[panel];
    const panelLeft = event.currentTarget.parentElement?.getBoundingClientRect().left || 0;

    const handlePointerMove = (moveEvent) => {
      const nextWidth = moveEvent.clientX - panelLeft;

      if (nextWidth < limits.collapseBelow) {
        updateLayoutPreferences(
          panel === "main"
            ? { isMainSidebarCollapsed: true }
            : { isSettingsSidebarCollapsed: true }
        );
        return;
      }

      const maxWidth = getSidebarMaxWidth(limits);
      const clampedWidth = Math.min(maxWidth, Math.max(limits.min, nextWidth));
      updateLayoutPreferences(
        panel === "main"
          ? { mainSidebarWidth: clampedWidth, isMainSidebarCollapsed: false }
          : { settingsSidebarWidth: clampedWidth, isSettingsSidebarCollapsed: false }
      );
    };

    const handlePointerUp = () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      document.body.classList.remove("is-resizing-sidebar");
    };

    document.body.classList.add("is-resizing-sidebar");
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp, { once: true });
    document.addEventListener("pointercancel", handlePointerUp, { once: true });
  };
  const [isSaveMenuOpen, setIsSaveMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const notify = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((currentToasts) => [
      ...currentToasts.filter((currentToast) => !toast.key || currentToast.key !== toast.key),
      { id, type: "info", ...toast },
    ]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((currentToast) => currentToast.id !== id));
    }, toast.duration || 4200);
  }, []);

  const dismissToast = (toastId) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  };

  const handleSettingsChange = async (patch) => {
    const currentSettings = userSettingsRef.current;
    const nextSettings = {
      ...currentSettings,
      ...patch,
      accessibility: patch.accessibility
        ? { ...currentSettings.accessibility, ...patch.accessibility }
        : currentSettings.accessibility,
    };
    const requestId = settingsRequestRef.current + 1;
    settingsRequestRef.current = requestId;
    userSettingsRef.current = nextSettings;
    setUserSettings(nextSettings);

    const { settings, syncStatus } = await persistUserSettings(nextSettings);
    if (settingsRequestRef.current === requestId) {
      userSettingsRef.current = settings;
      setUserSettings(settings);
      notify(syncStatus === "synced"
        ? { key: "settings-sync", type: "success", title: "Настройки сохранены" }
        : {
            key: "settings-sync",
            type: "warning",
            title: "Настройки сохранены на устройстве",
            message: "Синхронизация с сервером произойдёт после восстановления соединения.",
          });
    }
  };

  const mapReportFromApi = (apiReport) => {
    const result = apiReport.result || {};
    const coursesAnalysis = result.courses_analysis || [];
    const courseAnalysis = coursesAnalysis[0] || {};
    const reportName = apiReport.courseName
      || apiReport.course
      || courseAnalysis.course_name
      || "Индивидуальная траектория";

    return {
      id: apiReport.id || result.batch_id,
      course: reportName,
      title: apiReport.title || reportName,
      status: apiReport.status,
      error: apiReport.error,
      isArchived: Boolean(apiReport.isArchived),
      createdAt: apiReport.createdAt,
      result: apiReport.result
    };
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoadError("");
      const historyData = await getAnalysisHistory();
      if (Array.isArray(historyData)) {
        const mapped = isOfflineMode ? historyData : historyData.map(mapReportFromApi);
        setMockReports(mapped);
      }
    } catch (err) {
      if (isAuthExpiredError(err)) return;
      console.error("Failed to fetch analysis history:", err);
      setHistoryLoadError(err.message || "Не удалось загрузить историю отчетов.");
    }
  };

  const fetchArchivedHistory = async () => {
    try {
      setArchiveLoadError("");
      const historyData = await getAnalysisHistory({ onlyArchived: true });
      if (Array.isArray(historyData)) {
        const mapped = isOfflineMode ? historyData : historyData.map(mapReportFromApi);
        setArchivedReports(mapped);
      }
    } catch (err) {
      if (isAuthExpiredError(err)) return;
      console.error("Failed to fetch archived analysis history:", err);
      setArchiveLoadError(err.message || "Не удалось загрузить архив отчетов.");
    }
  };

  useEffect(() => {
    if (isOfflineMode) {
      seedOfflineReports(initialMockReports);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const loadHistory = async () => {
      await Promise.all([fetchHistory(), fetchArchivedHistory()]);
    };

    loadHistory();
  }, [token]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken("");
      setUser("");
      setUserEmail("");
      setMockReports([]);
      setArchivedReports([]);
      setRoute("login");
      window.location.hash = "login";
      notify({
        type: "warning",
        title: "Сессия истекла",
        message: "Пожалуйста, войдите в систему заново.",
      });
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [notify]);

  useEffect(() => {
    const handleNetworkError = () => notify({
      key: "api-connection",
      type: "error",
      title: "Соединение потеряно",
      message: "Проверьте сеть. Доступные действия можно повторить после восстановления связи.",
      duration: 7000,
    });
    const handleConnectionRestored = () => notify({
      key: "api-connection",
      type: "success",
      title: "Соединение восстановлено",
    });

    window.addEventListener("api:network-error", handleNetworkError);
    window.addEventListener("api:connection-restored", handleConnectionRestored);
    return () => {
      window.removeEventListener("api:network-error", handleNetworkError);
      window.removeEventListener("api:connection-restored", handleConnectionRestored);
    };
  }, [notify]);

  useEffect(() => {
    let ignore = false;
    const settingsVersionAtStart = settingsRequestRef.current;

    const syncSettings = async () => {
      const { settings } = token
        ? await loadUserSettings()
        : { settings: readLocalSettings() };

      if (!ignore && settingsRequestRef.current === settingsVersionAtStart) {
        userSettingsRef.current = settings;
        setUserSettings(settings);
      }
    };

    syncSettings();

    return () => {
      ignore = true;
    };
  }, [token]);

  useEffect(() => {
    writeLayoutPreferences(layoutPreferences);
  }, [layoutPreferences]);

  useEffect(() => {
    const root = document.documentElement;
    const isSystemDark =
      userSettings.theme === "system" &&
      window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const effectiveTheme = userSettings.theme === "system"
      ? (isSystemDark ? "dark" : "light")
      : userSettings.theme;

    root.dataset.theme = effectiveTheme;
    root.dataset.themePreference = userSettings.theme;
    const accessibility = userSettings.accessibility || {};
    root.dataset.accessibility = accessibility.enabled ? "enabled" : "default";
    root.dataset.fontSize = accessibility.enabled ? (accessibility.fontSize || "xxlarge") : "normal";
    root.dataset.contrast = accessibility.enabled ? (accessibility.colorScheme || "dark") : "standard";
    root.dataset.lineSpacing = accessibility.enabled ? "wide" : "normal";
    root.dataset.letterSpacing = accessibility.enabled ? "wide" : "normal";
    root.dataset.density = userSettings.minimalUi ? "minimal" : "comfortable";
    document.body.dataset.density = root.dataset.density;
  }, [userSettings, systemThemeTick]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) return;

    const handleSystemThemeChange = () => {
      setSystemThemeTick((tick) => tick + 1);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  useEffect(() => {
    const hasProcessing = mockReports.some(r => ["Queued", "Processing", "Retrying"].includes(r.status));
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchHistory();
    }, 4000);

    return () => clearInterval(interval);
  }, [mockReports]);

  useEffect(() => {
    if (!route.startsWith("report-detail-")) {
      return undefined;
    }
    const reportId = route.replace("report-detail-", "");
    const report = mockReports.find((item) => item.id === reportId);
    if (!report || !["Queued", "Processing", "Retrying"].includes(report.status)) {
      return undefined;
    }

    let ignore = false;
    const loadProgress = async () => {
      try {
        const progress = await getAnalysisStatus(reportId);
        if (!ignore) setTaskProgress(progress);
      } catch (err) {
        if (!isAuthExpiredError(err)) console.error("Failed to fetch task progress:", err);
      }
    };

    loadProgress();
    const interval = window.setInterval(loadProgress, 2000);
    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, [mockReports, route]);

  // Sync route with window hash and enforce route protection
  useEffect(() => {
    const handleHashChange = () => {
      const newRoute = window.location.hash.replace("#", "") || "upload";
      setTaskProgress(null);
      
      const isAuthRoute = newRoute === "login" || newRoute === "register";
      const hasToken = !!localStorage.getItem("token");

      if (!hasToken && !isAuthRoute) {
        window.location.hash = "login";
      } else if (hasToken && isAuthRoute) {
        window.location.hash = "upload";
      } else {
        setRoute(newRoute);
      }
      setIsEditingTitle(false); // Reset inline edit state on navigation
      setIsSaveMenuOpen(false);
      setIsProfileMenuOpen(false);
      setIsMenuOpen(false); // Close mobile drawer on route change
    };

    const currentHash = window.location.hash.replace("#", "");
    if (currentHash !== route) {
      window.history.replaceState(null, "", `#${route}`);
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [route]);

  // Update document title dynamically
  useEffect(() => {
    document.title = "ИИ-агент индивидуальной траектории обучения";
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const isOutsideSaveMenu = isSaveMenuOpen && !saveActionsRef.current?.contains(event.target);
      const isOutsideProfileMenu = isProfileMenuOpen && !profileActionsRef.current?.contains(event.target);

      if (!isOutsideSaveMenu && !isOutsideProfileMenu) return;

      if (isOutsideSaveMenu) {
        setIsSaveMenuOpen(false);
      }
      if (isOutsideProfileMenu) {
        setIsProfileMenuOpen(false);
      }

      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent?.stopImmediatePropagation?.();
      event.stopImmediatePropagation?.();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isSaveMenuOpen, isProfileMenuOpen]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (isAuthSubmitting) return;
    setIsAuthSubmitting(true);
    setAuthError("");
    try {
      if (!loginEmail || !loginPassword) {
        throw new Error("Заполните все поля.");
      }
      const data = await login(loginEmail, loginPassword);
      if (data && data.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);
        localStorage.setItem("userEmail", loginEmail);
        setToken(data.token);
        setUser(data.username);
        setUserEmail(loginEmail);
        setLoginEmail("");
        setLoginPassword("");
        window.location.hash = "upload";
      } else {
        throw new Error("Неверный формат ответа сервера.");
      }
    } catch (err) {
      const message = String(err.message || "");
      setAuthError(
        /invalid|неверн|unauthorized|credential/i.test(message)
          ? "Неверный email или пароль."
          : message || "Не удалось войти. Попробуйте еще раз."
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (isAuthSubmitting) return;
    setIsAuthSubmitting(true);
    setAuthError("");
    try {
      if (!registerUsername || !registerEmail || !registerPassword) {
        throw new Error("Заполните все поля.");
      }
      if (registerPassword.length < 12 || registerPassword.length > 128) {
        throw new Error("Пароль должен содержать от 12 до 128 символов.");
      }
      const data = await register(registerUsername, registerEmail, registerPassword);
      if (data && data.token) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", data.username);
        localStorage.setItem("userEmail", registerEmail);
        setToken(data.token);
        setUser(data.username);
        setUserEmail(registerEmail);
        setRegisterUsername("");
        setRegisterEmail("");
        setRegisterPassword("");
        window.location.hash = "upload";
      } else {
        throw new Error("Неверный формат ответа сервера.");
      }
    } catch (err) {
      setAuthError(err.message || "Ошибка регистрации.");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setIsProfileMenuOpen(false);
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userEmail");
    setToken("");
    setUser("");
    setUserEmail("");
    setMockReports([]);
    setArchivedReports([]);
    setRoute("login");
    window.location.hash = "login";
  };

  // Handle responsive mobile drawer class toggles on body
  useEffect(() => {
    document.body.classList.toggle("menu-open", isMenuOpen);
  }, [isMenuOpen]);

  const getPageTitle = (currentRoute) => {
    if (currentRoute === "upload" || currentRoute === "constructor") return "Создание траектории";
    if (currentRoute.startsWith("report-detail-")) return "Детали отчёта";
    if (currentRoute === "catalog") return "Каталог программ";
    if (currentRoute === "analytics" || currentRoute === "benchmarks") return "Аналитика обучения";
    if (currentRoute === "students") return "Сводка обучения";
    if (currentRoute === "settings") return "Настройки";
    if (currentRoute === "login") return "Авторизация";
    if (currentRoute === "register") return "Регистрация";
    return "ИИ-агент ИОТ";
  };

  const handleNewAnalysis = () => {
    window.location.hash = "upload";
  };

  const handleInlineRenameSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!editTitleValue.trim()) return;
    if (editTitleValue.trim().length > 255) {
      notify({ type: "warning", title: "Название слишком длинное", message: "Используйте не более 255 символов." });
      return;
    }

    const reportId = route.replace("report-detail-", "");
    try {
      await renameAnalysisReport(reportId, editTitleValue);
      await fetchHistory();
      setIsEditingTitle(false);
      notify({
        type: "success",
        title: "Отчет переименован",
      });
    } catch (err) {
      notify({
        type: "error",
        title: "Не удалось переименовать отчет",
        message: err.message,
      });
    }
  };


  const handleArchiveReport = async (reportId) => {
    setArchiveTargetId(reportId);
  };

  const confirmArchiveReport = async () => {
    if (!archiveTargetId) return;
    try {
      await archiveAnalysisReport(archiveTargetId);
      await fetchHistory();
      await fetchArchivedHistory();
      const archivedRoute = `report-detail-${archiveTargetId}`;
      setArchiveTargetId("");
      if (route === archivedRoute) {
        window.location.hash = "upload";
      }
      notify({
        type: "success",
        title: "Отчет архивирован",
      });
    } catch (err) {
      notify({
        type: "error",
        title: "Не удалось архивировать отчет",
        message: err.message,
      });
    }
  };

  const handleUnarchiveReport = async (reportId) => {
    try {
      await unarchiveAnalysisReport(reportId);
      await fetchHistory();
      await fetchArchivedHistory();
      notify({
        type: "success",
        title: "Отчет разархивирован",
        message: "Он снова доступен в основной истории.",
      });
    } catch (err) {
      notify({
        type: "error",
        title: "Не удалось разархивировать отчет",
        message: err.message,
      });
    }
  };

  const handleExportReport = async (report, format) => {
    setIsSaveMenuOpen(false);
    try {
      const isDegraded = report?.status === "CompletedWithLimitations"
        || report?.result?.quality_status === "degraded"
        || report?.result?.trajectory?.quality_status === "degraded";
      if (isDegraded) {
        throw new Error("Резервный результат нельзя экспортировать до экспертной проверки.");
      }
      if (format === "pdf") {
        await exportReportToPdf(report);
        notify({ type: "success", title: "PDF сохранен" });
        return;
      }
      if (format === "excel" || format === "xlsx") {
        await exportReportToXlsx(report);
        notify({ type: "success", title: "XLSX сохранен" });
        return;
      }
      exportReportToJson(report);
      notify({ type: "success", title: "JSON сохранен" });
    } catch (err) {
      console.error("Failed to export report:", err);
      notify({
        type: "error",
        title: "Не удалось сохранить файл",
        message: err.message,
      });
    }
  };

  const renderActivePage = () => {
    if (route === "catalog") {
      return (
        <section className="page active" id="catalog" data-title="Каталог программ 2025">
          <CatalogExplorer notify={notify} />
        </section>
      );
    }

    if (route === "analytics" || route === "benchmarks") {
      return (
        <section className="page active" id="analytics" data-title="Бенчмарк должностей">
          <ColleagueAnalytics notify={notify} />
        </section>
      );
    }

    if (route === "upload" || route === "constructor" || route === "") {
      return (
        <section className="page active" id="constructor" data-title="Конструктор ИОТ">
          <TrajectoryConstructor
            notify={notify}
            onTrajectoryCreated={(taskId) => {
              notify({
                type: "success",
                title: "Запрос принят",
                message: "Формирование траектории началось. Статус обновится автоматически.",
              });
              fetchHistory();
              window.location.hash = `report-detail-${taskId}`;
            }}
          />
        </section>
      );
    }

    if (route.startsWith("report-detail-")) {
      const reportId = route.replace("report-detail-", "");
      const report = mockReports.find((r) => r.id === reportId);

      if (!report) {
        return (
          <section className="page active">
            <div className="state-panel">
              <span className="state-icon state-icon-warm">
                <XCircle size={28} strokeWidth={2.2} />
              </span>
              <h2>Отчёт не найден</h2>
              <p className="muted">Пожалуйста, выберите существующий отчёт из истории в левой панели.</p>
              <button className="primary-button state-action" type="button" onClick={handleNewAnalysis}>
                Новый анализ
              </button>
            </div>
          </section>
        );
      }

      if (["Queued", "Processing", "Retrying"].includes(report.status)) {
        const pendingTitle = report.status === "Queued"
          ? "Анализ поставлен в очередь"
          : report.status === "Retrying"
            ? "Ожидание повторной попытки"
            : "Анализ в процессе...";
        return (
          <section className="page active" id="report-detail" data-title="Детали отчёта">
            <div className="state-panel">
              <span className="state-icon">
                <Clock3 size={28} strokeWidth={2.2} />
              </span>
              <h2>{pendingTitle}</h2>
              <p className="muted">
                {taskProgress?.progress_message || "Профиль и выбранная модель сохранены. Ожидаем фактический этап обработки."}
              </p>
              <div className="trajectory-progress" aria-label="Прогресс формирования траектории">
                <div
                  className={`trajectory-progress-track ${Number.isFinite(taskProgress?.progress_percent) ? "" : "is-indeterminate"}`.trim()}
                  aria-hidden="true"
                >
                  <span style={Number.isFinite(taskProgress?.progress_percent)
                    ? { width: `${taskProgress.progress_percent}%` }
                    : undefined}
                  />
                </div>
                <ol>
                  {[
                    ["queued", "Очередь"],
                    ["profile_analysis", "Анализ профиля"],
                    ["course_selection", "Подбор программ"],
                    ["result_formation", "Формирование результата"],
                  ].map(([stage, label], index, stages) => {
                    const matchedStageOrder = stages.findIndex(([currentStage]) => currentStage === taskProgress?.progress_stage);
                    const stageOrder = taskProgress?.progress_stage === "completed" ? stages.length : matchedStageOrder;
                    const fallbackOrder = report.status === "Queued" || report.status === "Retrying" ? 0 : -1;
                    const currentOrder = stageOrder >= 0 ? stageOrder : fallbackOrder;
                    return (
                      <li key={stage} className={index < currentOrder ? "is-complete" : index === currentOrder ? "is-active" : ""}>
                        <span>{index < currentOrder ? "✓" : index + 1}</span>
                        <strong>{label}</strong>
                      </li>
                    );
                  })}
                </ol>
              </div>
              {report.status === "Retrying" && (
                <p className="trajectory-retry-note">
                  Попытка {taskProgress?.attempt_count || 1}. Повтор произойдёт автоматически.
                </p>
              )}
              <button className="secondary-button state-action" type="button" onClick={() => { window.location.hash = "upload"; }}>
                Вернуться к загрузке
              </button>
            </div>
          </section>
        );
      }

      if (report.status === "Failed") {
        return (
          <section className="page active" id="report-detail" data-title="Детали отчёта">
            <div className="state-panel state-panel-danger">
              <span className="state-icon state-icon-danger">
                <XCircle size={28} strokeWidth={2.2} />
              </span>
              <h2>Анализ провалился</h2>
              <p className="muted">
                Ошибка: {report.error || "Неизвестная ошибка на стороне сервера."}
              </p>
              <button className="primary-button state-action" type="button" onClick={handleNewAnalysis}>
                Запустить новый анализ
              </button>
            </div>
          </section>
        );
      }

      return (
        <CourseReportDetailPage
          key={report.id}
          report={report}
          isEditingTitle={isEditingTitle}
          editTitleValue={editTitleValue}
          setEditTitleValue={setEditTitleValue}
          setIsEditingTitle={setIsEditingTitle}
          handleInlineRenameSubmit={handleInlineRenameSubmit}
          handleArchiveReport={handleArchiveReport}
          isSaveMenuOpen={isSaveMenuOpen}
          setIsSaveMenuOpen={setIsSaveMenuOpen}
          isProfileMenuOpen={isProfileMenuOpen}
          setIsProfileMenuOpen={setIsProfileMenuOpen}
          handleExportReport={handleExportReport}
          saveActionsRef={saveActionsRef}
        />
      );
    }

    if (route === "students") {
      return (
        <StudentsPage
          reports={mockReports}
          onNewAnalysis={handleNewAnalysis}
        />
      );
    }

    if (route === "settings") {
      return (
        <SettingsPage
          settings={userSettings}
          onSettingsChange={handleSettingsChange}
          sidebarWidth={layoutPreferences.settingsSidebarWidth}
          isSidebarCollapsed={layoutPreferences.isSettingsSidebarCollapsed}
          onSidebarToggle={handleSettingsSidebarToggle}
          onSidebarResizeStart={(event) => handleSidebarResizeStart("settings", event)}
          archivedReports={archivedReports}
          onUnarchiveReport={handleUnarchiveReport}
          archiveLoadError={archiveLoadError}
          onRetryArchive={fetchArchivedHistory}
        />
      );
    }

    if (route === "login") {
      return (
        <AuthPage
          mode="login"
          authError={authError}
          loginEmail={loginEmail}
          loginPassword={loginPassword}
          registerUsername={registerUsername}
          registerEmail={registerEmail}
          registerPassword={registerPassword}
          onLoginEmailChange={setLoginEmail}
          onLoginPasswordChange={setLoginPassword}
          onRegisterUsernameChange={setRegisterUsername}
          onRegisterEmailChange={setRegisterEmail}
          onRegisterPasswordChange={setRegisterPassword}
          onSubmit={handleLoginSubmit}
          onClearError={() => setAuthError("")}
          isSubmitting={isAuthSubmitting}
        />
      );
    }

    if (route === "register") {
      return (
        <AuthPage
          mode="register"
          authError={authError}
          loginEmail={loginEmail}
          loginPassword={loginPassword}
          registerUsername={registerUsername}
          registerEmail={registerEmail}
          registerPassword={registerPassword}
          onLoginEmailChange={setLoginEmail}
          onLoginPasswordChange={setLoginPassword}
          onRegisterUsernameChange={setRegisterUsername}
          onRegisterEmailChange={setRegisterEmail}
          onRegisterPasswordChange={setRegisterPassword}
          onSubmit={handleRegisterSubmit}
          onClearError={() => setAuthError("")}
          isSubmitting={isAuthSubmitting}
        />
      );
    }

    return (
      <section className="page active">
        <div className="state-panel">
          <span className="state-icon state-icon-warm">
            <XCircle size={28} strokeWidth={2.2} />
          </span>
          <h2>Страница не найдена</h2>
          <button className="primary-button state-action" type="button" onClick={handleNewAnalysis}>
            Новый анализ
          </button>
        </div>
      </section>
    );
  };

  const filteredReports = mockReports.filter((report) => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return true;
    return `${report.course} ${report.title}`.toLowerCase().includes(query);
  });

  const archiveTargetReport = mockReports.find((report) => report.id === archiveTargetId);
  const isAuthRoute = route === "login" || route === "register";

  if (isAuthRoute) {
    return (
      <>
        <AccessibilityToolbar settings={userSettings} onSettingsChange={handleSettingsChange} />
        <div className="auth-shell">
          <Suspense fallback={pageLoadingFallback}>{renderActivePage()}</Suspense>
        </div>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (route === "settings") {
    return (
      <>
        <AccessibilityToolbar settings={userSettings} onSettingsChange={handleSettingsChange} />
        <Suspense fallback={pageLoadingFallback}>{renderActivePage()}</Suspense>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <AccessibilityToolbar settings={userSettings} onSettingsChange={handleSettingsChange} />
      <AppLayout
        route={route}
        pageTitle={getPageTitle(route)}
        reports={filteredReports}
        historyQuery={historyQuery}
        onHistoryQueryChange={setHistoryQuery}
        onArchiveReport={handleArchiveReport}
        onNewAnalysis={handleNewAnalysis}
        token={token}
        user={user}
        userEmail={userEmail}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        isProfileMenuOpen={isProfileMenuOpen}
        setIsProfileMenuOpen={setIsProfileMenuOpen}
        setIsSaveMenuOpen={setIsSaveMenuOpen}
        profileActionsRef={profileActionsRef}
        onLogout={handleLogout}
        settings={userSettings}
        sidebarWidth={layoutPreferences.mainSidebarWidth}
        isSidebarCollapsed={layoutPreferences.isMainSidebarCollapsed}
        onSidebarToggle={handleMainSidebarToggle}
        onSidebarResizeStart={(event) => handleSidebarResizeStart("main", event)}
        historyLoadError={historyLoadError}
        onRetryHistory={fetchHistory}
      >
        <Suspense fallback={pageLoadingFallback}>{renderActivePage()}</Suspense>
      </AppLayout>

      <ConfirmDialog
        open={!!archiveTargetId}
        title="Архивировать отчет?"
        message={`Отчет ${archiveTargetReport ? `«${archiveTargetReport.course}»` : ""} будет перемещен в архив. Его можно вернуть в настройках.`}
        confirmLabel="Архивировать"
        onConfirm={confirmArchiveReport}
        onCancel={() => setArchiveTargetId("")}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default App;
