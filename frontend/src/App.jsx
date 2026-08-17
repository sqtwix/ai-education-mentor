import { useState, useEffect, useMemo, useRef } from "react";
import { Archive, Clock3, Files, Pencil, Save, Upload, XCircle } from "lucide-react";
import {
  login,
  register,
  uploadFiles,
  getAnalysisStatus,
  getAnalysisHistory,
  renameAnalysisReport,
  isOfflineMode,
  seedOfflineReports,
  createOfflineReport,
  updateOfflineReport,
  archiveAnalysisReport,
  unarchiveAnalysisReport,
} from "./api";
import { AppLayout } from "./components/Layout";
import { AccessibilityToolbar } from "./components/AccessibilityToolbar";
import { ConfirmDialog, NamingDialog, ToastStack } from "./components/Feedback";
import { AuthPage, SettingsPage, StudentsPage, CourseReportDetailPage } from "./components/Pages";
import { loadUserSettings, persistUserSettings, readLocalSettings } from "./settingsService";
import { getSidebarMaxWidth, layoutLimits, readLayoutPreferences, writeLayoutPreferences } from "./layoutPreferences";
import {
  exportReportToCsv,
  exportReportToDocx,
  exportReportToJson,
  exportReportToPdf,
  exportReportToXlsx,
} from "./reportExport";

// Initial Mock Reports Data representing course reviews dialog history
function generateMockResult(reportId) {
  if (reportId === "1") {
    return {
      batch_id: "1",
      courses_analysis: [
        {
          course_name: "Применение инструментов ИИ в гос управлении",
          period: "28.05-10.06",
          students_count: 42,
          statistics: {
            usefulness: { average: 8.4, median: 9.0, std_dev: 1.2, distribution: { low: 5.0, mid: 25.0, high: 70.0 } },
            practicality: { average: 7.9, median: 8.0, std_dev: 1.5, distribution: { low: 10.0, mid: 30.0, high: 60.0 } },
            accessibility: { average: 9.1, median: 10.0, std_dev: 0.8, distribution: { low: 2.0, mid: 18.0, high: 80.0 } },
            interaction: { average: 8.8, median: 9.0, std_dev: 1.1, distribution: { low: 4.0, mid: 21.0, high: 75.0 } },
            involvement: { detached_percent: 15.0, involved_percent: 85.0, yes_count: 6, no_count: 36 }
          },
          position_distribution: { "Специалист": 28, "Руководитель": 10, "Обеспечивающий специалист": 4 },
          preferred_formats: {
            "очное обучение в аудиториях Корпоративного университета": 20,
            "смешанное обучение: частично очно, частично дистанционно": 18,
            "полностью дистанционный формат обучения": 4
          },
          analytical_report: {
            section1_general_info: "Программа: Применение инструментов ИИ в гос управлении\nПериод проведения: 28.05-10.06\nСлушатели: 42 человека (из них 28 специалистов, 10 руководителей, 4 обеспечивающих специалиста).\nПреподаватели: Николай Иванов, Ольга Смирнова.",
            section2_key_criteria: {
              usefulness_summary: "Слушатели высоко оценили полезность программы (средний балл 8.4). Основной интерес вызвали темы практического использования ИИ для создания презентаций и автоматизации рутины.",
              practicality_summary: "Практико-ориентированность оценена на 7.9 балла. Большинство отметило полезность разбора реальных рабочих ситуаций, однако часть аудитории просит увеличить время на самостоятельную работу за ПК.",
              accessibility_summary: "Максимальная оценка у доступности материала (9.1 балла). Логика построения тем названа последовательной и понятной.",
              interaction_summary: "Взаимодействие с командой КУ оценено на 8.8 балла. Слушатели отметили высокую отзывчивость и быстрое решение возникающих вопросов.",
              involvement_summary: "Вовлеченность составила 85%. Лишь 15% (6 человек) указали на частичную отстраненность во время теоретического блока от Сбера."
            },
            section3_suggestions: {
              unwanted_topics: ["Обзорная лекция по истории ИИ", "Теоретические основы нейросетей от Сбера (повтор пройденного)"],
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
              { quote: "Хочется больше практики непосредственно в различных моделях искусственного интеллекта.", frequency: 3 }
            ],
            recommendations: [
              { target: "Теория", action_item: "Заменить или доработать блок лекций от Сбера, улучшить интерактивность.", priority: "Medium" },
              { target: "Практика", action_item: "Выделить больше часов для личной работы за ПК под руководством куратора.", priority: "High" }
            ]
          }
        }
      ]
    };
  }

  if (reportId === "2") {
    return {
      batch_id: "2",
      courses_analysis: [
        {
          course_name: "Разработка на Python для госслужащих",
          period: "12.05-25.05",
          students_count: 35,
          statistics: {
            usefulness: { average: 7.8, median: 8.0, std_dev: 1.4, distribution: { low: 8.0, mid: 32.0, high: 60.0 } },
            practicality: { average: 7.2, median: 7.0, std_dev: 1.7, distribution: { low: 15.0, mid: 35.0, high: 50.0 } },
            accessibility: { average: 8.5, median: 9.0, std_dev: 1.1, distribution: { low: 5.0, mid: 25.0, high: 70.0 } },
            interaction: { average: 8.6, median: 9.0, std_dev: 1.0, distribution: { low: 4.0, mid: 26.0, high: 70.0 } },
            involvement: { detached_percent: 22.0, involved_percent: 78.0, yes_count: 8, no_count: 27 }
          },
          position_distribution: { "Специалист": 20, "Руководитель": 12, "Обеспечивающий специалист": 3 },
          preferred_formats: {
            "очное обучение в аудиториях Корпоративного университета": 12,
            "смешанное обучение: частично очно, частично дистанционно": 18,
            "полностью дистанционный формат обучения": 5
          },
          analytical_report: {
            section1_general_info: "Программа: Разработка на Python для госслужащих\nПериод проведения: 12.05-25.05\nСлушатели: 35 человек.\nПреподаватели: Петр Сидоров, Анна Кузнецова.",
            section2_key_criteria: {
              usefulness_summary: "Полезность программы оценена на 7.8 балла. Слушатели оценили возможность автоматизации рутинных процессов (работа с Excel и PDF через скрипты).",
              practicality_summary: "Практичность оценена на 7.2 балла. Часть слушателей столкнулась со сложностями в установке окружения Anaconda на рабочих местах.",
              accessibility_summary: "Доступность составила 8.5 балла. Написание кода с нуля вызвало затруднения у руководителей.",
              interaction_summary: "Взаимодействие с КУ оценено на 8.6 балла. Оперативная техническая помощь в настройке ПО.",
              involvement_summary: "Вовлеченность составила 78%. Отстраненность в 22% связана со сложностью синтаксиса программирования."
            },
            section3_suggestions: {
              unwanted_topics: ["Сложные структуры классов и ООП", "Работа с базами данных (слишком углубленно)"],
              added_topics: [
                { topic: "Работа с библиотекой pandas для анализа Excel таблиц", count: 10 },
                { topic: "Основы веб-скрейпинга для госслужащих", count: 4 }
              ],
              preferred_format_summary: "Большинство выбрало смешанный формат обучения для возможности проработки кода дома."
            },
            section4_trajectory: {
              further_implementation_needed: "Продолжить реализацию, разделив группы на базовый и продвинутый уровень.",
              student_selection_correction: "Рекомендуется не включать в группы программирования слушателей без базовой компьютерной грамотности.",
              added_topics_recommendation: "Добавить разбор библиотеки pandas во вторую часть программы.",
              hours_correction_needed: "Увеличить практическую часть за счет сокращения лекционного материала.",
              format_correction_needed: "Рекомендован смешанный формат (лекции - вебинары, практика - очно в классах).",
              conclusions: [
                "Программа актуальна для автоматизации табличных данных.",
                "Необходимо исключить сложные абстрактные темы ООП.",
                "Разделить потоки на руководителей и специалистов."
              ]
            }
          },
          dashboard_data: {
            correlation_matrix: {
              "Полезность": { "Полезность": 1.0, "Практика": 0.81, "Доступность": 0.58, "Взаимодействие": 0.39 },
              "Практика": { "Полезность": 0.81, "Практика": 1.0, "Доступность": 0.62, "Взаимодействие": 0.41 },
              "Доступность": { "Полезность": 0.58, "Практика": 0.62, "Доступность": 1.0, "Взаимодействие": 0.48 },
              "Взаимодействие": { "Полезность": 0.39, "Практика": 0.41, "Доступность": 0.48, "Взаимодействие": 1.0 }
            },
            trend_data: [
              { period: "апрель 2026", usefulness_avg: 7.5, practicality_avg: 6.8, accessibility_avg: 8.2, interaction_avg: 8.4, involvement_avg: 72.0 },
              { period: "май 2026", usefulness_avg: 7.8, practicality_avg: 7.2, accessibility_avg: 8.5, interaction_avg: 8.6, involvement_avg: 78.0 }
            ]
          },
          text_analysis: {
            top_topics: [
              { topic: "Автоматизация Excel таблиц", description: "Написание скриптов для слияния и фильтрации Excel файлов.", frequency: 18 },
              { topic: "Парсинг документов PDF", description: "Извлечение текстовых блоков из отчетов PDF.", frequency: 10 }
            ],
            sentiment: { positive: 62.0, neutral: 25.0, negative: 13.0 },
            key_problems: [
              { problem: "Трудности с установкой Anaconda", frequency_percent: 25.0, severity: "Medium" },
              { problem: "Слишком быстрый темп лектора", frequency_percent: 20.0, severity: "High" }
            ],
            quotes: [
              { quote: "Очень помогли скрипты для работы с Excel, теперь экономлю по 2 часа в день.", frequency: 5 }
            ],
            recommendations: [
              { target: "Программа", action_item: "Разделить обучение на два независимых трека: Базовый и Продвинутый.", priority: "High" }
            ]
          }
        }
      ]
    };
  }

  return null;
}

const initialMockReports = [
  {
    id: "1",
    course: "Применение инструментов ИИ в гос управлении",
    title: "Анализ опроса за период 28.05-10.06",
    status: "Completed",
    isArchived: false,
    createdAt: new Date().toISOString(),
    result: generateMockResult("1")
  },
  {
    id: "2",
    course: "Разработка на Python для госслужащих",
    title: "Анализ опроса за период 12.05-25.05",
    status: "Completed",
    isArchived: false,
    createdAt: new Date().toISOString(),
    result: generateMockResult("2")
  }
];

function App() {
  const [route, setRoute] = useState(() => {
    return window.location.hash.replace("#", "") || "upload";
  });
  const [mockReports, setMockReports] = useState([]);
  const [selectedModel, setSelectedModel] = useState("Qwen_Local");
  const [selectedResponseFiles, setSelectedResponseFiles] = useState([]);
  const [showValidation, setShowValidation] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisTaskId, setAnalysisTaskId] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [toasts, setToasts] = useState([]);
  const [archiveTargetId, setArchiveTargetId] = useState("");
  const [archivedReports, setArchivedReports] = useState([]);
  const [userSettings, setUserSettings] = useState(() => readLocalSettings());
  const [layoutPreferences, setLayoutPreferences] = useState(() => readLayoutPreferences());
  const [systemThemeTick, setSystemThemeTick] = useState(0);

  // Authentication states
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => localStorage.getItem("username") || "");
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem("userEmail") || "");
  const [authError, setAuthError] = useState("");

  // Login form states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form states
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");

  const responsesInputRef = useRef(null);
  const intervalRef = useRef(null);
  const saveActionsRef = useRef(null);
  const profileActionsRef = useRef(null);

  // Naming & Renaming states
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [namingTaskId, setNamingTaskId] = useState("");
  const [namingValue, setNamingValue] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [isEditingReportContent, setIsEditingReportContent] = useState(false);

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
  const [manualCourse, setManualCourse] = useState("Новый локальный курс");
  const [manualTitle, setManualTitle] = useState("Черновик offline-отчета");

  const notify = (toast) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((currentToasts) => [...currentToasts, { id, type: "info", ...toast }]);
    window.setTimeout(() => {
      setToasts((currentToasts) => currentToasts.filter((currentToast) => currentToast.id !== id));
    }, toast.duration || 4200);
  };

  const dismissToast = (toastId) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId));
  };

  const handleSettingsChange = async (patch) => {
    const nextSettings = {
      ...userSettings,
      ...patch,
    };
    setUserSettings(nextSettings);

    const { settings } = await persistUserSettings(nextSettings);
    setUserSettings(settings);
  };

  const mapReportFromApi = (apiReport) => {
    const result = apiReport.result || {};
    const coursesAnalysis = result.courses_analysis || [];
    const courseAnalysis = coursesAnalysis[0] || {};

    return {
      id: apiReport.id || result.batch_id,
      course: courseAnalysis.course_name || apiReport.course || "Электронный курс",
      title: apiReport.title || `Анализ опроса за период ${courseAnalysis.period || ""}`,
      status: apiReport.status,
      error: apiReport.error,
      isArchived: Boolean(apiReport.isArchived),
      createdAt: apiReport.createdAt,
      result: apiReport.result
    };
  };

  const fetchHistory = async () => {
    try {
      const historyData = await getAnalysisHistory();
      if (Array.isArray(historyData)) {
        const mapped = isOfflineMode ? historyData : historyData.map(mapReportFromApi);
        setMockReports(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch analysis history:", err);
    }
  };

  const fetchArchivedHistory = async () => {
    try {
      const historyData = await getAnalysisHistory({ onlyArchived: true });
      if (Array.isArray(historyData)) {
        const mapped = isOfflineMode ? historyData : historyData.map(mapReportFromApi);
        setArchivedReports(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch archived analysis history:", err);
    }
  };

  useEffect(() => {
    seedOfflineReports(initialMockReports);
  }, []);

  useEffect(() => {
    if (token) {
      fetchHistory();
      fetchArchivedHistory();
    } else {
      setMockReports([]);
      setArchivedReports([]);
    }
  }, [token]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken("");
      setUser("");
      setUserEmail("");
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
  }, []);

  useEffect(() => {
    let ignore = false;

    const syncSettings = async () => {
      const { settings } = token
        ? await loadUserSettings()
        : { settings: readLocalSettings() };

      if (!ignore) {
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
    const hasProcessing = mockReports.some(r => r.status === "Processing");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchHistory();
    }, 4000);

    return () => clearInterval(interval);
  }, [mockReports]);

  // Sync route with window hash and enforce route protection
  useEffect(() => {
    const handleHashChange = () => {
      const newRoute = window.location.hash.replace("#", "") || "upload";
      
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
      setIsEditingReportContent(false);
      setIsSaveMenuOpen(false);
      setIsProfileMenuOpen(false);
      setIsMenuOpen(false); // Close mobile drawer on route change
    };

    const initialRoute = window.location.hash.replace("#", "") || "upload";
    const isAuthRoute = initialRoute === "login" || initialRoute === "register";
    const hasToken = !!localStorage.getItem("token");

    if (!hasToken && !isAuthRoute) {
      window.location.hash = "login";
      setRoute("login");
    } else if (hasToken && isAuthRoute) {
      window.location.hash = "upload";
      setRoute("upload");
    } else {
      setRoute(initialRoute);
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Update document title dynamically
  useEffect(() => {
    document.title = "Анализ отзывов студентов — личный кабинет";
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
      setAuthError(err.message || "Ошибка авторизации.");
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    try {
      if (!registerUsername || !registerEmail || !registerPassword) {
        throw new Error("Заполните все поля.");
      }
      if (registerPassword.length < 6) {
        throw new Error("Пароль должен быть не менее 6 символов.");
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
    setRoute("login");
    window.location.hash = "login";
  };

  // Handle responsive mobile drawer class toggles on body
  useEffect(() => {
    document.body.classList.toggle("menu-open", isMenuOpen);
  }, [isMenuOpen]);

  const getPageTitle = (currentRoute) => {
    if (currentRoute === "upload") return "Загрузка данных";
    if (currentRoute.startsWith("report-detail-")) return "Детали отчёта";
    if (currentRoute === "students") return "Студенты";
    if (currentRoute === "settings") return "Настройки";
    if (currentRoute === "login") return "Авторизация";
    if (currentRoute === "register") return "Регистрация";
    return "Анализ отзывов студентов";
  };

  const handleFileChange = (e, type) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (type === "responses") {
      setSelectedResponseFiles(Array.from(files));
    }
  };

  const uploadValidation = useMemo(() => {
    if (selectedResponseFiles.length === 0) {
      return {
        status: "idle",
        title: "Файлы не выбраны",
        message: "Выберите Excel, CSV или ZIP-архив с анкетами.",
      };
    }

    const allowedExtensions = new Set(["csv", "xlsx", "zip"]);
    const invalidFiles = selectedResponseFiles.filter((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      return !allowedExtensions.has(extension);
    });
    const emptyFiles = selectedResponseFiles.filter((file) => file.size === 0);

    if (invalidFiles.length > 0) {
      return {
        status: "error",
        title: "Неподдерживаемый формат",
        message: `Проверьте файлы: ${invalidFiles.map((file) => file.name).join(", ")}. Поддерживаются только .xlsx, .csv и .zip.`,
      };
    }

    if (emptyFiles.length > 0) {
      return {
        status: "error",
        title: "Пустой файл",
        message: `Файлы без данных не будут обработаны: ${emptyFiles.map((file) => file.name).join(", ")}.`,
      };
    }

    return {
      status: "pending",
      title: "Базовая проверка пройдена",
      message: "Расширения и размер файлов корректны. Наличие обязательных колонок проверит сервер при запуске анализа.",
    };
  }, [selectedResponseFiles]);

  // Trigger validation banner visibility
  useEffect(() => {
    if (selectedResponseFiles.length > 0) {
      setShowValidation(true);
    } else {
      setShowValidation(false);
    }
  }, [selectedResponseFiles]);

  const resetUploadForm = () => {
    setSelectedResponseFiles([]);
    setShowValidation(false);
    setIsAnalyzing(false);
    setAnalysisProgress(0);
    if (responsesInputRef.current) responsesInputRef.current.value = "";
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const handleNewAnalysis = () => {
    resetUploadForm();
    window.location.hash = "upload";
  };

  const startAnalysis = async () => {
    if (selectedResponseFiles.length === 0) {
      notify({
        type: "warning",
        title: "Не хватает файлов",
        message: "Выберите файлы анкет опросов перед запуском анализа.",
      });
      return;
    }

    if (uploadValidation.status === "error") {
      notify({
        type: "error",
        title: uploadValidation.title,
        message: uploadValidation.message,
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisTaskId("Отправка...");

    try {
      const data = await uploadFiles(selectedResponseFiles, selectedModel);
      
      const serverTaskId = data.task_id;
      setAnalysisTaskId(serverTaskId);

      // Show success alert showing that files were successfully sent and accepted
      notify({
        type: "success",
        title: "Файлы приняты",
        message: data.message || "Файлы успешно отправлены и приняты в обработку.",
      });

      let progress = 0;
      let hasCompleted = false;

      // Local progress helper that goes slowly up to 90%
      intervalRef.current = setInterval(() => {
        if (!hasCompleted) {
          progress += Math.floor(Math.random() * 4) + 1;
          if (progress > 90) progress = 90;
          setAnalysisProgress(progress);
        }
      }, 1000);

      // Polling function
      const poll = async () => {
        try {
          const statusRes = await getAnalysisStatus(serverTaskId);
          if (statusRes.status === "Completed") {
            hasCompleted = true;
            clearInterval(intervalRef.current);
            setAnalysisProgress(100);

            // Construct new report based on real result from model
            const result = statusRes.result || {};
            const cleanResponseName = selectedResponseFiles[0].name.replace(/\.[^/.]+$/, "");
            const courseName = cleanResponseName.replace(/^\d{2}\.\d{2}-\d{2}\.\d{2}\s+/, "");

            setNamingTaskId(serverTaskId);
            setNamingValue(courseName);
            setShowNamingModal(true);

            const completedReport = {
              id: serverTaskId,
              course: courseName,
              title: `Анализ опроса за период ${cleanResponseName.match(/^\d{2}\.\d{2}-\d{2}\.\d{2}/)?.[0] || ""}`,
              status: "Completed",
              isArchived: false,
              createdAt: new Date().toISOString(),
              result: result
            };

            setMockReports((prev) => [completedReport, ...prev]);
            resetUploadForm();
          } else if (statusRes.status === "Failed") {
            clearInterval(intervalRef.current);
            setIsAnalyzing(false);
            await fetchHistory();
            notify({
              type: "error",
              title: "Анализ провалился",
              message: statusRes.error || "Неизвестная ошибка на стороне сервера.",
            });
          } else {
            // Processing... Continue polling after timeout
            setTimeout(poll, 3000);
          }
        } catch (err) {
          console.error("Polling error:", err);
          // Retry polling in case of transient network issues
          setTimeout(poll, 3000);
        }
      };

      // Start polling after 2 seconds
      setTimeout(poll, 2000);

    } catch (err) {
      setIsAnalyzing(false);
      notify({
        type: "error",
        title: "Не удалось отправить файлы",
        message: err.message,
      });
    }
  };

  const handleSaveReportName = async (e) => {
    if (e) e.preventDefault();
    if (!namingValue.trim()) {
      notify({
        type: "warning",
        title: "Введите название",
        message: "Название поможет быстро найти отчет в истории.",
      });
      return;
    }
    setIsSavingName(true);
    try {
      await renameAnalysisReport(namingTaskId, namingValue);
      await fetchHistory();
      setShowNamingModal(false);
      notify({
        type: "success",
        title: "Название сохранено",
        message: "Отчет добавлен в историю анализов.",
      });
      window.location.hash = `report-detail-${namingTaskId}`;
    } catch (err) {
      notify({
        type: "error",
        title: "Не удалось сохранить название",
        message: err.message,
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSkipNaming = async () => {
    setShowNamingModal(false);
    await fetchHistory();
    window.location.hash = `report-detail-${namingTaskId}`;
  };

  const handleInlineRenameSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!editTitleValue.trim()) return;

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

  const persistOfflineReport = (reportId, patch) => {
    setMockReports((reports) =>
      reports.map((report) => (report.id === reportId ? { ...report, ...patch } : report))
    );
    updateOfflineReport(reportId, patch).catch((err) => {
      notify({
        type: "error",
        title: "Не удалось сохранить изменения",
        message: err.message,
      });
    });
  };

  const handleReportFieldChange = (reportId, field, value) => {
    persistOfflineReport(reportId, { [field]: value });
  };

  const handleFindingChange = (report, index, field, value) => {
    const nextErrors = report.errors.map((error, currentIndex) =>
      currentIndex === index ? { ...error, [field]: value } : error
    );
    persistOfflineReport(report.id, { errors: nextErrors });
  };

  const addFinding = (report) => {
    persistOfflineReport(report.id, {
      errors: [
        ...report.errors,
        {
          priority: "medium",
          val: "25%",
          question: "Новый вопрос",
          text: "Опишите найденную массовую ошибку.",
        },
      ],
    });
  };

  const removeFinding = (report, index) => {
    persistOfflineReport(report.id, {
      errors: report.errors.filter((_, currentIndex) => currentIndex !== index),
    });
  };

  const handleRecommendationChange = (report, index, value) => {
    const nextRecommendations = report.recommendations.map((recommendation, currentIndex) =>
      currentIndex === index ? value : recommendation
    );
    persistOfflineReport(report.id, { recommendations: nextRecommendations });
  };

  const addRecommendation = (report) => {
    persistOfflineReport(report.id, {
      recommendations: [...report.recommendations, "Новая рекомендация для методиста."],
    });
  };

  const removeRecommendation = (report, index) => {
    persistOfflineReport(report.id, {
      recommendations: report.recommendations.filter((_, currentIndex) => currentIndex !== index),
    });
  };

  const handleCreateManualReport = async (e) => {
    e.preventDefault();
    try {
      const report = await createOfflineReport({
        course: manualCourse.trim() || "Новый локальный курс",
        title: manualTitle.trim() || "Черновик offline-отчета",
        errors: [
          {
            priority: "medium",
            val: "30%",
            question: "Вопрос q_demo",
            text: "Черновая находка для ручного редактирования в песочнице.",
          },
        ],
        recommendations: ["Уточните содержание отчета в редакторе offline mode."],
      });
      await fetchHistory();
      window.location.hash = `report-detail-${report.id}`;
      notify({
        type: "success",
        title: "Черновик создан",
        message: "Отчет открыт для просмотра и редактирования.",
      });
    } catch (err) {
      notify({
        type: "error",
        title: "Не удалось создать отчет",
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
      setIsEditingReportContent(false);
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
      if (format === "pdf") {
        await exportReportToPdf(report);
        notify({ type: "success", title: "PDF сохранен" });
        return;
      }
      if (format === "excel") {
        await exportReportToXlsx(report);
        notify({ type: "success", title: "Excel сохранен" });
        return;
      }
      if (format === "docx") {
        await exportReportToDocx(report);
        notify({ type: "success", title: "DOCX сохранен" });
        return;
      }
      if (format === "csv") {
        exportReportToCsv(report);
        notify({ type: "success", title: "CSV сохранен" });
        return;
      }
      exportReportToJson(report);
      notify({ type: "success", title: "JSON сохранен" });
    } catch (err) {
      console.error("Failed to export report:", err);
      notify({
        type: "error",
        title: "Не удалось сохранить файл",
      });
    }
  };

  const getTimelineStepClass = (stepIndex, currentProgress) => {
    const thresholds = [0, 25, 50, 75];
    if (currentProgress >= thresholds[stepIndex]) {
      if (currentProgress > thresholds[stepIndex] + 20 || currentProgress === 100) {
        return "done";
      }
      return "active-step";
    }
    return "";
  };

  const renderActivePage = () => {
    if (route === "upload") {
      return (
        <section className="page active" id="upload" data-title="Загрузка данных">
          {!isAnalyzing ? (
            <div className="split upload-layout" id="upload-form-panel">
              <section className="panel">
                <p className="eyebrow">Новый анализ</p>
                <h2>Загрузите файлы опросов слушателей</h2>
                <p className="muted">Поддерживаются файлы Excel (.xlsx), CSV или ZIP-архивы с таблицами опросов. Если в файлах не хватает колонок или они повреждены, система сообщит об этом до запуска анализа.</p>

                <div
                  className="dropzone"
                  id="responses-dropzone"
                  style={{ cursor: "pointer" }}
                  onClick={() => responsesInputRef.current.click()}
                >
                  <span><Files size={30} strokeWidth={2.2} /></span>
                  <strong id="responses-file-name">
                    {selectedResponseFiles.length === 0
                      ? "Выберите файлы анкет"
                      : selectedResponseFiles.length === 1
                      ? selectedResponseFiles[0].name
                      : `Выбрано файлов: ${selectedResponseFiles.length}`}
                  </strong>
                  <p>Нажмите для выбора файлов анкет (.csv, .xlsx) или ZIP-архива</p>
                  <input
                    type="file"
                    id="responses-input"
                    ref={responsesInputRef}
                    style={{ display: "none" }}
                    multiple
                    accept=".csv,.xlsx,.zip"
                    onChange={(e) => handleFileChange(e, "responses")}
                  />
                </div>
              </section>

              <section className="panel">
                <p className="eyebrow">Параметры</p>
                <h3>Выбор ИИ-модели</h3>
                <label className="field-label">ИИ-модель</label>
                <div className="segmented" id="model-selector-container">
                  <button
                    type="button"
                    style={{ textDecoration: "line-through", textDecorationColor: "#dc2626", textDecorationThickness: "2px", color: "var(--text-muted)", opacity: 0.75 }}
                    onClick={() => {
                      notify({
                        type: "info",
                        title: "Информация",
                        message: "Данные модели в разработке",
                      });
                    }}
                    title="Данные модели в разработке"
                  >
                    DeepSeek
                  </button>
                  <button
                    type="button"
                    style={{ textDecoration: "line-through", textDecorationColor: "#dc2626", textDecorationThickness: "2px", color: "var(--text-muted)", opacity: 0.75 }}
                    onClick={() => {
                      notify({
                        type: "info",
                        title: "Информация",
                        message: "Данные модели в разработке",
                      });
                    }}
                    title="Данные модели в разработке"
                  >
                    GigaChat
                  </button>
                  <button
                    type="button"
                    className={selectedModel === "Qwen_Local" ? "selected" : ""}
                    onClick={() => setSelectedModel("Qwen_Local")}
                  >
                    Qwen Local
                  </button>
                </div>

                {showValidation && (
                  <div
                    className={`validation-box validation-box-${uploadValidation.status}`}
                    id="upload-validation-box"
                    style={{ marginTop: "20px" }}
                  >
                    <b>{uploadValidation.title}</b>
                    <p>{uploadValidation.message}</p>
                  </div>
                )}

                <button
                  className="primary-button wide"
                  id="start-analysis-btn"
                  style={{ marginTop: "20px", width: "100%" }}
                  onClick={startAnalysis}
                  disabled={uploadValidation.status === "error"}
                >
                  Запустить анализ
                </button>

                {isOfflineMode && (
                  <form className="offline-create-form" onSubmit={handleCreateManualReport}>
                    <p className="eyebrow">Offline песочница</p>
                    <h3>Создать отчет вручную</h3>
                    <label>
                      Название курса
                      <input
                        type="text"
                        value={manualCourse}
                        onChange={(e) => setManualCourse(e.target.value)}
                      />
                    </label>
                    <label>
                      Заголовок отчета
                      <textarea
                        rows="3"
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                      />
                    </label>
                    <button type="submit" className="secondary-button wide">
                      Создать черновик
                    </button>
                  </form>
                )}
              </section>
            </div>
          ) : (
            <div className="panel" id="upload-progress-panel" style={{ marginTop: "0" }}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow" id="progress-task-id">Задача {analysisTaskId}</p>
                  <h2>Выполнение анализа</h2>
                </div>
                <span className="badge" id="progress-percentage-badge">{analysisProgress}%</span>
              </div>
              <div className="progress-track">
                <span id="progress-fill-bar" style={{ width: `${analysisProgress}%`, transition: "width 0.4s ease" }}></span>
              </div>
              <div className="timeline" id="progress-timeline-steps">
                <div id="step-1" className={getTimelineStepClass(0, analysisProgress)}>
                  <b>Файлы приняты</b>
                  <p>Эталон и файлы ответов прошли базовую проверку.</p>
                </div>
                <div id="step-2" className={getTimelineStepClass(1, analysisProgress)}>
                  <b>Данные приведены к JSON</b>
                  <p>{isOfflineMode ? "Offline mode подготовил локальную структуру отчета." : "api-core подготовил структуру для ai-driver."}</p>
                </div>
                <div id="step-3" className={getTimelineStepClass(2, analysisProgress)}>
                  <b>ИИ-агенты анализируют паттерны</b>
                  <p>{isOfflineMode ? "Создается шаблонный демо-результат для проверки интерфейса." : "Статистик проверяет время, методист ищет типовые ошибки."}</p>
                </div>
                <div id="step-4" className={getTimelineStepClass(3, analysisProgress)}>
                  <b>Формируется отчёт</b>
                  <p>{isOfflineMode ? "JSON будет доступен локально после завершения." : "Excel, JSON и PDF будут готовы после завершения."}</p>
                </div>
              </div>
            </div>
          )}
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

      if (report.status === "Processing") {
        return (
          <section className="page active" id="report-detail" data-title="Детали отчёта">
            <div className="state-panel">
              <span className="state-icon">
                <Clock3 size={28} strokeWidth={2.2} />
              </span>
              <h2>Анализ в процессе...</h2>
              <p className="muted">ИИ-агенты в данный момент обрабатывают файлы ответов студентов. Пожалуйста, подождите.</p>
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
          onNewAnalysis={() => {
            resetUploadForm();
            window.location.hash = "upload";
          }}
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
          {renderActivePage()}
        </div>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  if (route === "settings") {
    return (
      <>
        <AccessibilityToolbar settings={userSettings} onSettingsChange={handleSettingsChange} />
        {renderActivePage()}
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
        onNewAnalysis={() => {
          resetUploadForm();
          window.location.hash = "upload";
        }}
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
      >
        {renderActivePage()}
      </AppLayout>

      <NamingDialog
        open={showNamingModal}
        value={namingValue}
        isSaving={isSavingName}
        onChange={setNamingValue}
        onSubmit={handleSaveReportName}
        onSkip={handleSkipNaming}
      />
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
