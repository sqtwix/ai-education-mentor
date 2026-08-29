import React, { useState, useEffect, useRef } from "react";
import { 
  UserCheck, Plus, Trash2,
  Cpu, Shield, RefreshCw,
  UploadCloud, FileSpreadsheet, AlertCircle, Sparkles
} from "lucide-react";
import { getCurrentUser, getHistoryUsers, getCoursesCatalog, getBenchmarks, getModelAvailability, generateTrajectory, uploadFiles, isAuthExpiredError } from "../api";
import { UnifiedDropdown } from "./UnifiedDropdown";

const getDraftKey = () => `iot:trajectory-draft:${localStorage.getItem("userEmail") || "current"}`;
const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_FILE_COUNT = 20;
const ALLOWED_UPLOAD_EXTENSIONS = new Set(["json", "xlsx", "xls", "csv", "zip"]);

const readTrajectoryDraft = () => {
  try {
    return JSON.parse(sessionStorage.getItem(getDraftKey()) || "null");
  } catch {
    return null;
  }
};

export function TrajectoryConstructor({ onTrajectoryCreated, notify }) {
  const [initialDraft] = useState(readTrajectoryDraft);
  const [usersList, setUsersList] = useState([]);
  const [catalogList, setCatalogList] = useState([]);
  const [positionsList, setPositionsList] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [activeTab, setActiveTab] = useState("custom"); // "existing" | "custom" | "files"
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);
  const [canAccessRegistry, setCanAccessRegistry] = useState(false);

  // Profile fields
  const [fio, setFio] = useState(() => initialDraft?.fio || "");
  const [position, setPosition] = useState(() => initialDraft?.position || "");
  const [department, setDepartment] = useState(() => initialDraft?.department || "");
  const [experienceYears, setExperienceYears] = useState(() => Number(initialDraft?.experienceYears) || 0);
  const [careerGoal, setCareerGoal] = useState(() => initialDraft?.careerGoal || "");
  const [learningHistory, setLearningHistory] = useState(() => (
    Array.isArray(initialDraft?.learningHistory) ? initialDraft.learningHistory : []
  ));

  // New course in history inputs
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseType, setNewCourseType] = useState("");
  const [newCourseStatus, setNewCourseStatus] = useState("");

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const submissionRequestIdRef = useRef("");

  // Model selection
  const [selectedModel, setSelectedModel] = useState("");
  const [modelAvailability, setModelAvailability] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const clearDraft = () => {
    sessionStorage.removeItem(getDraftKey());
  };

  const getSubmissionRequestId = () => {
    if (!submissionRequestIdRef.current) {
      submissionRequestIdRef.current = globalThis.crypto?.randomUUID?.()
        || `iot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    return submissionRequestIdRef.current;
  };

  useEffect(() => {
    submissionRequestIdRef.current = "";
  }, [activeTab, careerGoal, department, fio, learningHistory, position, selectedModel, uploadedFiles]);

  useEffect(() => {
    const hasRestoredDraft = Boolean(
      initialDraft?.fio
      || initialDraft?.position
      || initialDraft?.department
      || initialDraft?.careerGoal
      || initialDraft?.learningHistory?.length
    );
    if (hasRestoredDraft) {
      notify?.({
        type: "info",
        title: "Черновик восстановлен",
        message: "Поля профиля восстановлены после обновления страницы.",
      });
    }
  }, [initialDraft, notify]);

  useEffect(() => {
    const hasDraftData = Boolean(
      fio.trim()
      || position.trim()
      || department.trim()
      || careerGoal.trim()
      || learningHistory.length
    );
    if (!hasDraftData) {
      clearDraft();
      return;
    }

    sessionStorage.setItem(getDraftKey(), JSON.stringify({
      version: 1,
      activeTab: "custom",
      fio,
      position,
      department,
      experienceYears,
      careerGoal,
      learningHistory,
      savedAt: new Date().toISOString(),
    }));
  }, [activeTab, careerGoal, department, experienceYears, fio, learningHistory, position]);

  const selectUser = (user) => {
    setFio(user.fio || "");
    setPosition(user.position || "");
    setDepartment(user.department || "");
    setExperienceYears(user.experience_years ?? 0);
    setCareerGoal(user.career_goal || "");
    setLearningHistory(user.learning_history || []);
  };

  useEffect(() => {
    async function loadData() {
      try {
        setInitialLoadError("");
        const [session, catalog, benchmarks, availability] = await Promise.all([
          getCurrentUser(),
          getCoursesCatalog(),
          getBenchmarks({ force: reloadKey > 0 }),
          getModelAvailability().catch(() => ({ models: [] })),
        ]);
        setCatalogList(catalog || []);
        setPositionsList(Object.keys(benchmarks?.benchmarks_by_position || {}));
        setDepartmentsList(Array.from(new Set(
          Object.values(benchmarks?.benchmarks_by_position_and_dept || {})
            .map((item) => item?.department)
            .filter(Boolean)
        )).sort((left, right) => left.localeCompare(right, "ru")));
        const models = availability?.models || [];
        setModelAvailability(models);
        setSelectedModel(models.find((model) => model.configured)?.id || "");

        const registryAllowed = session?.role === "Admin";
        setCanAccessRegistry(registryAllowed);
        if (registryAllowed) {
          const users = await getHistoryUsers();
          setUsersList(users || []);
        }
        if (reloadKey > 0) {
          notify?.({ type: "success", title: "Данные конструктора обновлены" });
        }
      } catch (err) {
        if (isAuthExpiredError(err)) return;
        console.error("Failed to load initial data:", err);
        const message = err.message || "Не удалось загрузить каталог, справочники или сведения о моделях.";
        setInitialLoadError(message);
        notify?.({
          type: "error",
          title: "Конструктор загрузился не полностью",
          message,
        });
      }
    }
    loadData();
  }, [notify, reloadKey]);

  const handleUserSelectChange = (value) => {
    const idx = parseInt(value, 10);
    setSelectedUserIndex(idx);
    if (usersList[idx]) {
      selectUser(usersList[idx]);
    }
  };

  const handleAddHistoryItem = () => {
    if (!newCourseName.trim() || !newCourseType || !newCourseStatus) {
      notify?.({
        type: "warning",
        title: "Заполните данные программы",
        message: "Укажите название, тип и статус обучения.",
      });
      return;
    }
    setLearningHistory([
      ...learningHistory,
      {
        course_name: newCourseName.trim(),
        course_type: newCourseType,
        status: newCourseStatus
      }
    ]);
    setNewCourseName("");
  };

  const handleRemoveHistoryItem = (index) => {
    setLearningHistory(learningHistory.filter((_, i) => i !== index));
  };

  const acceptUploadedFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const invalidExtension = files.find((file) => {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      return !ALLOWED_UPLOAD_EXTENSIONS.has(extension);
    });
    const oversizedFile = files.find((file) => file.size > MAX_UPLOAD_FILE_BYTES);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

    let message = "";
    if (files.length > MAX_UPLOAD_FILE_COUNT) message = `Можно выбрать не более ${MAX_UPLOAD_FILE_COUNT} файлов.`;
    else if (invalidExtension) message = `Формат файла «${invalidExtension.name}» не поддерживается.`;
    else if (files.some((file) => file.size === 0)) message = "Пустые файлы не допускаются.";
    else if (oversizedFile) message = `Файл «${oversizedFile.name}» превышает 25 МБ.`;
    else if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) message = "Общий размер выбранных файлов превышает 50 МБ.";

    if (message) {
      notify?.({ type: "warning", title: "Файлы не выбраны", message });
      return;
    }
    setUploadedFiles(files);
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      acceptUploadedFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      acceptUploadedFiles(e.target.files);
    }
    e.target.value = "";
  };

  const handleGenerate = async () => {
    setIsGenerating(true);

    try {
      if (!selectedModel) {
        throw new Error("Нет настроенной модели ИИ. Добавьте ключ облачного провайдера или запустите локальную модель.");
      }
      if (activeTab === "files") {
        if (uploadedFiles.length === 0) {
          throw new Error("Выберите хотя бы один файл с данными профиля или истории обучения.");
        }
        // Загрузка через файлы
        const res = await uploadFiles(uploadedFiles, selectedModel, getSubmissionRequestId());
        const taskId = res.task_id || res.id;
        if (!taskId) throw new Error("Backend API не вернул идентификатор задачи.");
        clearDraft();
        submissionRequestIdRef.current = "";
        if (onTrajectoryCreated) onTrajectoryCreated(taskId);
      } else {
        if (!fio.trim() || !position.trim() || !department.trim() || !careerGoal.trim()) {
          throw new Error("Заполните ФИО, должность, ИОГВ и цель обучения.");
        }
        // Генерация через профиль
        const employeeProfile = {
          fio,
          position,
          department,
          experience_years: experienceYears,
          career_goal: careerGoal,
          learning_history: learningHistory
        };

        const res = await generateTrajectory(employeeProfile, selectedModel, getSubmissionRequestId());

        if (!res.task_id) throw new Error("Backend API не вернул идентификатор задачи.");
        clearDraft();
        submissionRequestIdRef.current = "";
        if (onTrajectoryCreated) onTrajectoryCreated(res.task_id);
      }
    } catch (err) {
      console.error("Generation failed:", err);
      const message = err.message || "Ошибка при формировании траектории";
      notify?.({
        type: "error",
        title: "Не удалось запустить формирование ИОТ",
        message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const modelInfo = (id) => modelAvailability.find((model) => model.id === id);

  return (
    <div className="constructor-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Индивидуальная траектория обучения</p>
          <h2>Создать индивидуальную траекторию</h2>
          <p className="muted">
            Укажите данные сотрудника, выберите доступную модель и получите маршрут по программам каталога 2025 года.
          </p>
        </div>
      </section>

      {initialLoadError && (
        <div className="state-panel state-panel-compact state-panel-danger constructor-load-error" role="alert">
          <span className="state-icon state-icon-danger"><AlertCircle size={24} /></span>
          <div>
            <h3>Не все данные загрузились</h3>
            <p className="muted">{initialLoadError}</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw size={16} /> Повторить
          </button>
        </div>
      )}

      <div className="constructor-grid">
        <div className="panel constructor-panel">
          <div className="constructor-section-heading">
            <span className="step-number" aria-hidden="true">1</span>
            <div>
              <h3>Источник данных</h3>
              <p className="muted">Выберите способ подготовки профиля.</p>
            </div>
          </div>

          {/* Переключатель вкладок режима */}
          <div className="mode-segmented-tabs">
            {canAccessRegistry && (
              <button
                type="button"
                className={`mode-tab-btn ${activeTab === "existing" ? "active" : ""}`}
                aria-pressed={activeTab === "existing"}
                onClick={() => {
                  setActiveTab("existing");
                  if (usersList[selectedUserIndex]) selectUser(usersList[selectedUserIndex]);
                }}
              >
                <UserCheck size={16} /> Из базы
              </button>
            )}
            <button 
              type="button"
              className={`mode-tab-btn ${activeTab === "custom" ? "active" : ""}`}
              aria-pressed={activeTab === "custom"}
              onClick={() => setActiveTab("custom")}
            >
              <Plus size={16} /> Новый профиль
            </button>
            <button 
              type="button"
              className={`mode-tab-btn ${activeTab === "files" ? "active" : ""}`}
              aria-pressed={activeTab === "files"}
              onClick={() => setActiveTab("files")}
            >
              <UploadCloud size={16} /> Файл
            </button>
          </div>

          {/* ВКЛАДКА 1: Выбор из реестра 323 служащих */}
          {activeTab === "existing" && (
            <div className="form-group">
              <label className="form-label" htmlFor="trajectory-registry-user">
                <UserCheck size={16} /> Сотрудник
              </label>
              <UnifiedDropdown
                id="trajectory-registry-user"
                value={String(selectedUserIndex)}
                onChange={handleUserSelectChange}
                options={usersList.map((u, idx) => ({
                  value: String(idx),
                  label: `${u.fio} — ${u.position} (${u.department}) [${u.learning_history?.length || 0} курсов]`,
                }))}
                ariaLabel="Сотрудник"
              />
            </div>
          )}

          {/* ВКЛАДКА 1 и 2: Поля профиля */}
          {activeTab !== "files" && (
            <>
              <div className="profile-form-grid">
                <div className="form-group">
                  <label className="form-label" htmlFor="trajectory-fio">ФИО сотрудника</label>
                  <input 
                    id="trajectory-fio"
                    type="text" 
                    className="form-input" 
                    value={fio} 
                    onChange={(e) => setFio(e.target.value)} 
                    placeholder="Например: Иванов Алексей Петрович"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="trajectory-position">Должность</label>
                  <UnifiedDropdown
                    id="trajectory-position"
                    value={position}
                    onChange={setPosition}
                    options={positionsList}
                    placeholder="Выберите или введите должность"
                    ariaLabel="Должность"
                    editable
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label className="form-label" htmlFor="trajectory-department">Ведомство (ИОГВ)</label>
                  <UnifiedDropdown
                    id="trajectory-department"
                    value={department}
                    onChange={setDepartment}
                    options={departmentsList}
                    placeholder="Ведомство Санкт-Петербурга"
                    ariaLabel="Ведомство (ИОГВ)"
                    editable
                    required
                  />
                </div>

                <div className="form-group full-width">
                  <label className="form-label" htmlFor="trajectory-goal">Цель обучения</label>
                  <input 
                    id="trajectory-goal"
                    type="text" 
                    className="form-input" 
                    value={careerGoal} 
                    onChange={(e) => setCareerGoal(e.target.value)} 
                    placeholder="Укажите фактическую цель обучения сотрудника"
                    required
                  />
                </div>
              </div>

              {/* Блок истории обучения */}
              <div className="history-container-box">
                <div className="history-header-row">
                  <div>
                    <h4>Пройденные программы</h4>
                    <p className="muted">Они не попадут в рекомендации.</p>
                  </div>
                  <span className="history-count">{learningHistory.length}</span>
                </div>

                <div className="history-chips-wrap">
                  {learningHistory.map((item, idx) => {
                    const isPassed = String(item.status || "").toLowerCase().includes("пройден") || String(item.status || "").toLowerCase().includes("успешно");
                    const isFailed = String(item.status || "").toLowerCase().includes("не пройден");
                    return (
                      <div 
                        key={idx} 
                        className={`history-course-chip ${isPassed ? "is-passed" : isFailed ? "is-failed" : "is-progress"}`}
                      >
                        <span className="chip-tag-type">{item.course_type || "Тип не указан"}</span>
                        <span className="chip-course-title" title={item.course_name}>{item.course_name}</span>
                        <span className="chip-status-text">({item.status || "Статус не указан"})</span>
                        <button 
                          type="button" 
                          className="chip-del-btn"
                          title="Удалить из истории"
                          onClick={() => handleRemoveHistoryItem(idx)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                  {learningHistory.length === 0 && (
                    <div className="history-empty-copy">
                      <strong>Пройденные программы пока не добавлены</strong>
                      <p className="muted text-sm">Добавьте их вручную ниже — такие программы не попадут в рекомендации.</p>
                    </div>
                  )}
                </div>

                <details className="history-add-details">
                  <summary>Добавить программу вручную</summary>
                  <div className="history-add-bar">
                  <UnifiedDropdown
                    id="history-course-name"
                    className="history-course-dropdown"
                    value={newCourseName}
                    onChange={setNewCourseName}
                    options={catalogList.map((course) => course.name)}
                    placeholder="Добавить курс в историю..."
                    ariaLabel="Название программы"
                    editable
                  />

                  <UnifiedDropdown
                    value={newCourseType}
                    onChange={setNewCourseType}
                    options={["ППК", "ЭК"]}
                    placeholder="Тип"
                    ariaLabel="Тип программы"
                  />

                  <UnifiedDropdown
                    value={newCourseStatus}
                    onChange={setNewCourseStatus}
                    options={["Пройден", "Не пройден", "В процессе"]}
                    placeholder="Статус"
                    ariaLabel="Статус программы"
                  />

                  <button 
                    type="button" 
                    className="secondary-button"
                    onClick={handleAddHistoryItem}
                  >
                    <Plus size={15} /> Добавить
                  </button>
                  </div>
                </details>
              </div>
            </>
          )}

          {/* ВКЛАДКА 3: Загрузка файлов */}
          {activeTab === "files" && (
            <div className="form-group">
              <div 
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Выбрать файлы для анализа"
                style={{ cursor: "pointer" }}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  multiple 
                  accept=".xlsx,.xls,.csv,.json,.zip"
                  style={{ display: "none" }} 
                />
                <UploadCloud size={40} strokeWidth={1.8} style={{ color: "var(--accent)" }} />
                <strong>Перетащите файлы или выберите на устройстве</strong>
                <p className="muted">
                  Поддерживаются выгрузки истории обучения (.xlsx, .xls, .csv), профили (.json) и архивы (.zip)
                </p>
                <span className="file-formats">XLSX, XLS, CSV, JSON или ZIP · до 25 МБ на файл, до 50 МБ всего</span>
              </div>

              {uploadedFiles.length > 0 && (
                <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label className="form-label">Выбранные файлы для анализа ({uploadedFiles.length}):</label>
                  {uploadedFiles.map((file, idx) => (
                    <div key={idx} className="history-course-chip is-passed" style={{ justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <FileSpreadsheet size={16} />
                        <strong>{file.name}</strong>
                        <small className="muted">({(file.size / 1024).toFixed(1)} КБ)</small>
                      </div>
                      <button 
                        type="button" 
                        className="chip-del-btn"
                        aria-label={`Удалить файл ${file.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadedFiles((currentFiles) => currentFiles.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="panel constructor-panel">
          <div className="constructor-section-heading">
            <span className="step-number" aria-hidden="true">2</span>
            <div>
              <h3>Модель анализа</h3>
              <p className="muted">Можно выбрать только настроенную модель.</p>
            </div>
          </div>

          {/* Список карточек моделей */}
          <div className="model-choice-list">
            <button
              type="button"
              className={`model-choice-card ${selectedModel === "deepseek" ? "selected" : ""}`}
              aria-pressed={selectedModel === "deepseek"}
              onClick={() => setSelectedModel("deepseek")}
              disabled={!modelInfo("deepseek")?.configured}
            >
              <div className="model-card-top">
                <span className="model-card-name">
                  <Sparkles size={17} style={{ color: "var(--accent)" }} /> DeepSeek
                </span>
                <span className="model-kind">Зарубежная</span>
              </div>
              <span className="model-card-desc">
                {modelInfo("deepseek")?.configured
                  ? `Настроена модель: ${modelInfo("deepseek").model}.`
                  : "Не настроена: отсутствует ключ DeepSeek API."}
              </span>
            </button>

            <button
              type="button"
              className={`model-choice-card ${selectedModel === "sbergpt" ? "selected" : ""}`}
              aria-pressed={selectedModel === "sbergpt"}
              onClick={() => setSelectedModel("sbergpt")}
              disabled={!modelInfo("sbergpt")?.configured}
            >
              <div className="model-card-top">
                <span className="model-card-name">
                  <Shield size={17} style={{ color: "var(--accent-2)" }} /> Sber GigaChat Pro
                </span>
                <span className="model-kind">Отечественная</span>
              </div>
              <span className="model-card-desc">
                {modelInfo("sbergpt")?.configured
                  ? `Настроена модель: ${modelInfo("sbergpt").model}.`
                  : "Не настроена: отсутствует ключ Sber GigaChat."}
              </span>
            </button>

            <button
              type="button"
              className={`model-choice-card ${selectedModel === "qwen_local" ? "selected" : ""}`}
              aria-pressed={selectedModel === "qwen_local"}
              onClick={() => setSelectedModel("qwen_local")}
              disabled={!modelInfo("qwen_local")?.configured}
            >
              <div className="model-card-top">
                <span className="model-card-name">
                  <Cpu size={17} style={{ color: "var(--accent-3)" }} /> Qwen Local (GGUF)
                </span>
                <span className="model-kind">Локальная</span>
              </div>
              <span className="model-card-desc">
                {modelInfo("qwen_local")?.configured
                  ? `Локальный сервис готов: ${modelInfo("qwen_local").model}.`
                  : "Локальная модель выключена или недоступна."}
              </span>
            </button>
          </div>

          {!selectedModel && (
            <div className="model-unavailable-note" role="status">
              <AlertCircle size={17} />
              <span>
                Генерация ИОТ временно недоступна: ни одна модель не подключена. Каталог, аналитика,
                история и настройки продолжают работать.
              </span>
            </div>
          )}

          <details className="pipeline-details">
            <summary>Как формируется рекомендация</summary>
            <div className="agent-pipeline-flow">
            <div className="agent-flow-item">
              <span className="agent-flow-badge">1</span>
              <div className="agent-flow-info">
                <strong>Проверка профиля</strong>
                <small>Учитываются цель и уже пройденные программы.</small>
              </div>
            </div>
            <div className="agent-flow-item">
              <span className="agent-flow-badge">2</span>
              <div className="agent-flow-info">
                <strong>Подбор программ</strong>
                <small>Кандидаты выбираются из официального каталога.</small>
              </div>
            </div>
            <div className="agent-flow-item">
              <span className="agent-flow-badge">3</span>
              <div className="agent-flow-info">
                <strong>Проверка результата</strong>
                <small>Для рекомендаций фиксируются основания и ограничения.</small>
              </div>
            </div>
            </div>
          </details>

          {/* Индикатор процесса при генерации */}
          {isGenerating && (
            <div className="generating-progress-box">
              <RefreshCw size={20} className="animate-spin" />
              <div>
                <strong>
                  Создаём задачу анализа…
                </strong>
                <p className="muted text-xs" style={{ margin: "2px 0 0" }}>
                  Пожалуйста, подождите. ИИ-агенты Корпоративного университета формируют траекторию.
                </p>
              </div>
            </div>
          )}

          {/* Кнопка запуска */}
          <button 
            type="button"
            className="primary-button wide"
            disabled={!selectedModel || isGenerating || (activeTab === "files" && uploadedFiles.length === 0)}
            onClick={handleGenerate}
            style={{ minHeight: "46px", fontSize: "1rem" }}
          >
            {isGenerating ? (
              <>
                <RefreshCw size={18} className="animate-spin" style={{ marginRight: "8px" }} />
                Формирование траектории...
              </>
            ) : (
              <>
                <Sparkles size={18} style={{ marginRight: "8px" }} />
                Сформировать ИОТ
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
