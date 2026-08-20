import React, { useState, useEffect, useRef } from "react";
import { 
  UserCheck, Plus, Trash2, ChevronDown, 
  Cpu, Building, Briefcase, Target, Shield, ArrowRight, RefreshCw,
  UploadCloud, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Sparkles, Layers
} from "lucide-react";
import { getHistoryUsers, getCoursesCatalog, generateTrajectory, uploadFiles } from "../api";

export function TrajectoryConstructor({ onTrajectoryCreated }) {
  const [usersList, setUsersList] = useState([]);
  const [catalogList, setCatalogList] = useState([]);
  const [activeTab, setActiveTab] = useState("existing"); // "existing" | "custom" | "files"
  const [selectedUserIndex, setSelectedUserIndex] = useState(0);

  // Profile fields
  const [fio, setFio] = useState("Иванов Алексей Петрович");
  const [position, setPosition] = useState("Главный специалист");
  const [department, setDepartment] = useState("Администрация Губернатора Санкт-Петербурга");
  const [experienceYears, setExperienceYears] = useState(3);
  const [careerGoal, setCareerGoal] = useState("Развитие управленческих и цифровых компетенций в сфере госуправления");
  const [learningHistory, setLearningHistory] = useState([]);

  // New course in history inputs
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseType, setNewCourseType] = useState("ППК");
  const [newCourseStatus, setNewCourseStatus] = useState("Пройден");

  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Model selection
  const [selectedModel, setSelectedModel] = useState("deepseek");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const POSITIONS = [
    "Главный специалист",
    "Ведущий специалист",
    "Начальник отдела",
    "Главный специалист-юрисконсульт",
    "Заместитель начальника отдела",
    "Заместитель главы Администрации",
    "Начальник Управления - главный бухгалтер Администрации Губернатора",
    "Заместитель начальника Управления-начальник отдела",
    "Начальник сектора",
    "Главный специалист Комитета",
    "Ведущий специалист - юрисконсульт",
    "Специалист 1-й категории",
    "Консультант",
    "Советник"
  ];

  const DEPARTMENTS = [
    "Администрация Губернатора Санкт-Петербурга",
    "Комитет по информатизации и связи",
    "Комитет по экономической политике и стратегическому планированию",
    "Комитет по государственному контролю, использованию и охране памятников истории и культуры",
    "Комитет по социальной политике Санкт-Петербурга",
    "Администрация Центрального района",
    "Администрация Приморского района",
    "Администрация Адмиралтейского района",
    "Государственная жилищная инспекция Санкт-Петербурга",
    "Комитет по промышленной политике, инновациям и торговле"
  ];

  useEffect(() => {
    async function loadData() {
      try {
        const [users, catalog] = await Promise.all([
          getHistoryUsers(),
          getCoursesCatalog()
        ]);
        setUsersList(users || []);
        setCatalogList(catalog || []);

        if (users && users.length > 0) {
          selectUser(users[0]);
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
      }
    }
    loadData();
  }, []);

  const selectUser = (user) => {
    setFio(user.fio || "Служащий");
    setPosition(user.position || "Главный специалист");
    setDepartment(user.department || "Администрация Губернатора Санкт-Петербурга");
    setExperienceYears(user.experience_years || 3);
    setCareerGoal(user.career_goal || "Повышение эффективности служебной деятельности");
    setLearningHistory(user.learning_history || []);
  };

  const handleUserSelectChange = (e) => {
    const idx = parseInt(e.target.value, 10);
    setSelectedUserIndex(idx);
    if (usersList[idx]) {
      selectUser(usersList[idx]);
    }
  };

  const handleAddHistoryItem = () => {
    if (!newCourseName.trim()) return;
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

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setUploadedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadedFiles(Array.from(e.target.files));
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMessage("");
    setGenerationStep(1);

    try {
      if (activeTab === "files" && uploadedFiles.length > 0) {
        // Загрузка через файлы
        setGenerationStep(1);
        const res = await uploadFiles(uploadedFiles, selectedModel);
        setGenerationStep(3);
        if (onTrajectoryCreated) {
          onTrajectoryCreated(res.task_id || res.id || "batch_upload");
        }
      } else {
        // Генерация через профиль
        const employeeProfile = {
          fio,
          position,
          department,
          experience_years: experienceYears,
          career_goal: careerGoal,
          learning_history: learningHistory
        };

        const timer1 = setTimeout(() => setGenerationStep(2), 1200);
        const timer2 = setTimeout(() => setGenerationStep(3), 2400);

        const res = await generateTrajectory(employeeProfile, selectedModel);

        clearTimeout(timer1);
        clearTimeout(timer2);

        if (onTrajectoryCreated) {
          onTrajectoryCreated(res.task_id || "direct_gen");
        }
      }
    } catch (err) {
      console.error("Generation failed:", err);
      setErrorMessage(err.message || "Ошибка при формировании траектории");
    } finally {
      setIsGenerating(false);
      setGenerationStep(0);
    }
  };

  return (
    <div className="constructor-shell">
      {/* 1. Верхний баннер Hero Panel */}
      <section className="hero-panel">
        <div>
          <p className="eyebrow">ИНДИВИДУАЛЬНАЯ ОБРАЗОВАТЕЛЬНАЯ ТРАЕКТОРИЯ (ИОТ)</p>
          <h2>Конструктор индивидуальной траектории обучения</h2>
          <p className="muted">
            Мультиагентный конвейер анализирует профиль служащего, задачи ведомства и историю обучения, 
            формируя доказательный маршрут развития из аккредитованных программ 2025 года.
          </p>
        </div>
        <div className="hero-metrics">
          <div>
            <strong>221 программа</strong>
            <span>в каталоге 2025 года (ППК и ЭК)</span>
          </div>
          <div>
            <strong>1 314 записей</strong>
            <span>в реестре истории обучения ГГС</span>
          </div>
          <div>
            <strong>36 должностей</strong>
            <span>с когортными бенчмарками</span>
          </div>
        </div>
      </section>

      {/* 2. Сетка из 2 панелей (Слева форма/файлы, Справа выбор ИИ и запуск) */}
      <div className="constructor-grid">
        {/* ЛЕВАЯ ПАНЕЛЬ: Профиль служащего или Загрузка файлов */}
        <div className="panel constructor-panel">
          <p className="eyebrow">ПАРАМЕТРЫ ПРОФИЛЯ СЛУЖАЩЕГО</p>

          {/* Переключатель вкладок режима */}
          <div className="mode-segmented-tabs">
            <button 
              type="button"
              className={`mode-tab-btn ${activeTab === "existing" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("existing");
                if (usersList[selectedUserIndex]) selectUser(usersList[selectedUserIndex]);
              }}
            >
              <UserCheck size={16} /> Реестр служащих ({usersList.length || 323})
            </button>
            <button 
              type="button"
              className={`mode-tab-btn ${activeTab === "custom" ? "active" : ""}`}
              onClick={() => setActiveTab("custom")}
            >
              <Plus size={16} /> Новый профиль ГГС
            </button>
            <button 
              type="button"
              className={`mode-tab-btn ${activeTab === "files" ? "active" : ""}`}
              onClick={() => setActiveTab("files")}
            >
              <UploadCloud size={16} /> Загрузить файл (.xlsx/.json)
            </button>
          </div>

          {/* ВКЛАДКА 1: Выбор из реестра 323 служащих */}
          {activeTab === "existing" && (
            <div className="form-group">
              <label className="form-label">
                <UserCheck size={16} /> Выберите сотрудника из базы Корпоративного университета:
              </label>
              <select 
                className="form-select"
                value={selectedUserIndex}
                onChange={handleUserSelectChange}
              >
                {usersList.map((u, idx) => (
                  <option key={idx} value={idx}>
                    {u.fio} — {u.position} ({u.department}) [{u.learning_history?.length || 0} курсов]
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ВКЛАДКА 1 и 2: Поля профиля */}
          {activeTab !== "files" && (
            <>
              <div className="profile-form-grid">
                <div className="form-group">
                  <label className="form-label">ФИО сотрудника:</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={fio} 
                    onChange={(e) => setFio(e.target.value)} 
                    placeholder="Например: Иванов Алексей Петрович"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Должность ГГС:</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={position} 
                    onChange={(e) => setPosition(e.target.value)} 
                    list="positions-datalist"
                    placeholder="Выберите или введите должность"
                  />
                  <datalist id="positions-datalist">
                    {POSITIONS.map((p, idx) => <option key={idx} value={p} />)}
                  </datalist>
                </div>

                <div className="form-group full-width">
                  <label className="form-label">Исполнительный орган государственной власти (ИОГВ):</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={department} 
                    onChange={(e) => setDepartment(e.target.value)} 
                    list="dept-datalist"
                    placeholder="Ведомство Санкт-Петербурга"
                  />
                  <datalist id="dept-datalist">
                    {DEPARTMENTS.map((d, idx) => <option key={idx} value={d} />)}
                  </datalist>
                </div>

                <div className="form-group full-width">
                  <label className="form-label">Целевой вектор развития / Цели обучения:</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={careerGoal} 
                    onChange={(e) => setCareerGoal(e.target.value)} 
                    placeholder="Например: Развитие проектных навыков, клиентоцентричности и работы с цифровыми данными"
                  />
                </div>
              </div>

              {/* Блок истории обучения */}
              <div className="history-container-box">
                <div className="history-header-row">
                  <h4>История освоенных программ (исключаются из рекомендаций):</h4>
                  <span className="badge">{learningHistory.length} программ</span>
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
                        <span className="chip-tag-type">{item.course_type || "ППК"}</span>
                        <span className="chip-course-title" title={item.course_name}>{item.course_name}</span>
                        <span className="chip-status-text">({item.status || "Пройден"})</span>
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
                    <p className="muted text-sm" style={{ margin: "4px 0" }}>
                      История обучения пуста (служащий еще не проходил программы в КУ СПб).
                    </p>
                  )}
                </div>

                {/* Строка добавления курса */}
                <div className="history-add-bar">
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{ flex: 1, minWidth: "180px" }}
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    placeholder="Добавить курс в историю..."
                    list="catalog-datalist"
                  />
                  <datalist id="catalog-datalist">
                    {catalogList.map((c, idx) => <option key={idx} value={c.name} />)}
                  </datalist>

                  <select 
                    className="form-select" 
                    style={{ width: "90px" }}
                    value={newCourseType}
                    onChange={(e) => setNewCourseType(e.target.value)}
                  >
                    <option value="ППК">ППК</option>
                    <option value="ЭК">ЭК</option>
                  </select>

                  <select 
                    className="form-select" 
                    style={{ width: "130px" }}
                    value={newCourseStatus}
                    onChange={(e) => setNewCourseStatus(e.target.value)}
                  >
                    <option value="Пройден">Пройден</option>
                    <option value="Не пройден">Не пройден</option>
                    <option value="В процессе">В процессе</option>
                  </select>

                  <button 
                    type="button" 
                    className="secondary-button"
                    onClick={handleAddHistoryItem}
                  >
                    <Plus size={15} /> Добавить
                  </button>
                </div>
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
                <strong>Перетащите файлы сюда или нажмите для выбора</strong>
                <p className="muted">
                  Поддерживаются выгрузки истории обучения (.xlsx, .csv), профили (.json) и архивы (.zip)
                </p>
                <span className="badge">Excel, CSV, JSON, ZIP</span>
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadedFiles(uploadedFiles.filter((_, i) => i !== idx));
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

        {/* ПРАВАЯ ПАНЕЛЬ: Выбор модели ИИ и запуск генерации */}
        <div className="panel constructor-panel">
          <div>
            <p className="eyebrow">ПАРАМЕТРЫ ИИ-ГЕНЕРАЦИИ</p>
            <h3>Выбор группы ИИ-агентов</h3>
            <p className="muted">Выберите нейросетевую модель для конвейера:</p>
          </div>

          {/* Список карточек моделей */}
          <div className="model-choice-list">
            <div 
              className={`model-choice-card ${selectedModel === "deepseek" ? "selected" : ""}`}
              onClick={() => setSelectedModel("deepseek")}
            >
              <div className="model-card-top">
                <span className="model-card-name">
                  <Sparkles size={17} style={{ color: "var(--accent)" }} /> DeepSeek V3 / R1
                </span>
                <span className="badge">Зарубежная</span>
              </div>
              <span className="model-card-desc">
                Облачный API • Наивысшая точность структурирования и детализации учебных результатов (ZUV).
              </span>
            </div>

            <div 
              className={`model-choice-card ${selectedModel === "sbergpt" ? "selected" : ""}`}
              onClick={() => setSelectedModel("sbergpt")}
            >
              <div className="model-card-top">
                <span className="model-card-name">
                  <Shield size={17} style={{ color: "var(--accent-2)" }} /> Sber GigaChat Pro
                </span>
                <span className="badge">Отечественная</span>
              </div>
              <span className="model-card-desc">
                Российский Cloud API • Полное соответствие стандартам госслужбы РФ и импортозамещению.
              </span>
            </div>

            <div 
              className={`model-choice-card ${selectedModel === "qwen_local" ? "selected" : ""}`}
              onClick={() => setSelectedModel("qwen_local")}
            >
              <div className="model-card-top">
                <span className="model-card-name">
                  <Cpu size={17} style={{ color: "var(--accent-3)" }} /> Qwen 2.5 Local (GGUF)
                </span>
                <span className="badge">100% Автономная</span>
              </div>
              <span className="model-card-desc">
                Air-Gapped сервер • Данные не покидают закрытый контур ведомства. Работает без интернета.
              </span>
            </div>
          </div>

          {/* Мультиагентный конвейер (Stepper) */}
          <div className="agent-pipeline-flow">
            <div className="agent-flow-item">
              <span className="agent-flow-badge">1</span>
              <div className="agent-flow-info">
                <strong>competency-analyst</strong>
                <small>Анализ дефицита компетенций и исключение пройденных программ</small>
              </div>
            </div>
            <div className="agent-flow-item">
              <span className="agent-flow-badge">2</span>
              <div className="agent-flow-info">
                <strong>trajectory-architect</strong>
                <small>Проектирование 3 этапов развития (Базовый, Профильный, Продвинутый)</small>
              </div>
            </div>
            <div className="agent-flow-item">
              <span className="agent-flow-badge">3</span>
              <div className="agent-flow-info">
                <strong>trajectory-justifier</strong>
                <small>Методическое обоснование на основе бенчмарков когорты коллег</small>
              </div>
            </div>
          </div>

          {/* Индикатор процесса при генерации */}
          {isGenerating && (
            <div className="generating-progress-box">
              <RefreshCw size={20} className="animate-spin" />
              <div>
                <strong>
                  {generationStep === 1 && "Шаг 1/3: Анализ профиля и исключение дублей..."}
                  {generationStep === 2 && "Шаг 2/3: Проектирование этапов траектории..."}
                  {generationStep === 3 && "Шаг 3/3: Методическое обоснование и валидация..."}
                </strong>
                <p className="muted text-xs" style={{ margin: "2px 0 0" }}>
                  Пожалуйста, подождите. ИИ-агенты Корпоративного университета формируют траекторию.
                </p>
              </div>
            </div>
          )}

          {/* Ошибка если есть */}
          {errorMessage && (
            <div className="state-panel state-panel-danger" style={{ padding: "12px", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--danger)" }}>
                <AlertCircle size={18} />
                <strong>Ошибка генерации</strong>
              </div>
              <p className="muted text-sm" style={{ margin: 0 }}>{errorMessage}</p>
            </div>
          )}

          {/* Кнопка запуска */}
          <button 
            type="button"
            className="primary-button wide"
            disabled={isGenerating || (activeTab === "files" && uploadedFiles.length === 0)}
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
                Сформировать индивидуальную траекторию
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
