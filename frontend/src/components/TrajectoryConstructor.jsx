import React, { useState, useEffect } from "react";
import { 
  UserCheck, Sparkles, Plus, Trash2, CheckCircle2, ChevronDown, 
  Cpu, Building, Briefcase, Target, Shield, ArrowRight, RefreshCw
} from "lucide-react";
import { getHistoryUsers, getCoursesCatalog, generateTrajectory } from "../api";

export function TrajectoryConstructor({ onTrajectoryCreated }) {
  const [usersList, setUsersList] = useState([]);
  const [catalogList, setCatalogList] = useState([]);
  const [selectedUserMode, setSelectedUserMode] = useState("existing"); // "existing" or "custom"
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

  // Model selection
  const [selectedModel, setSelectedModel] = useState("deepseek");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0); // 0..3
  const [errorMessage, setErrorMessage] = useState("");

  const POSITIONS = [
    "Ведущий специалист",
    "Главный специалист",
    "Главный специалист-юрисконсульт",
    "Начальник отдела",
    "Заместитель начальника отдела",
    "Заместитель главы Администрации",
    "Начальник Управления - главный бухгалтер Администрации Губернатора",
    "Заместитель начальника Управления-начальник отдела",
    "Начальник сектора",
    "Главный специалист Комитета",
    "Ведущий специалист - юрисконсульт"
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
    "Государственная жилищная инспекция Санкт-Петербурга"
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
    setDepartment(user.department || "Администрация Санкт-Петербурга");
    setExperienceYears(user.experience_years || 3);
    setCareerGoal(user.career_goal || "Повышение профессионального мастерства");
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

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMessage("");
    setGenerationStep(1);

    try {
      const employeeProfile = {
        fio,
        position,
        department,
        experience_years: experienceYears,
        career_goal: careerGoal,
        learning_history: learningHistory
      };

      // Step animation timers for multi-agent feel
      setTimeout(() => setGenerationStep(2), 1200);
      setTimeout(() => setGenerationStep(3), 2400);

      const resp = await generateTrajectory(employeeProfile, selectedModel);
      
      if (onTrajectoryCreated) {
        onTrajectoryCreated(resp.task_id || resp.trajectory_id);
      }
    } catch (err) {
      setErrorMessage(err.message || "Ошибка при генерации траектории.");
      setIsGenerating(false);
      setGenerationStep(0);
    }
  };

  return (
    <div className="constructor-container">
      <div className="constructor-card">
        <div className="constructor-header">
          <div className="title-with-icon">
            <Sparkles className="text-primary" size={24} />
            <div>
              <h3>Конструктор индивидуальной траектории обучения (ИОТ)</h3>
              <p className="muted">
                Мультиагентная генерация персонализированного трека развития на основе должности, ИОГВ и истории обучения
              </p>
            </div>
          </div>
        </div>

        {/* Переключатель режима: Выбор из базы или Ручной ввод */}
        <div className="mode-toggle-group">
          <button 
            className={`mode-btn ${selectedUserMode === "existing" ? "active" : ""}`}
            onClick={() => {
              setSelectedUserMode("existing");
              if (usersList[selectedUserIndex]) selectUser(usersList[selectedUserIndex]);
            }}
          >
            <UserCheck size={16} /> Выбрать сотрудника из базы истории ({usersList.length})
          </button>
          <button 
            className={`mode-btn ${selectedUserMode === "custom" ? "active" : ""}`}
            onClick={() => setSelectedUserMode("custom")}
          >
            <Plus size={16} /> Создать новый профиль ГГС
          </button>
        </div>

        {selectedUserMode === "existing" && usersList.length > 0 && (
          <div className="form-group mb-4">
            <label className="form-label">Сотрудник из реестра истории обучения:</label>
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

        <div className="profile-inputs-grid">
          <div className="form-group">
            <label className="form-label">ФИО сотрудника:</label>
            <input 
              type="text" 
              className="form-input" 
              value={fio} 
              onChange={(e) => setFio(e.target.value)} 
              placeholder="ФИО сотрудника"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Должность ГГС:</label>
            <div className="input-with-datalist">
              <input 
                type="text" 
                className="form-input" 
                value={position} 
                onChange={(e) => setPosition(e.target.value)} 
                list="positions-datalist"
              />
              <datalist id="positions-datalist">
                {POSITIONS.map((p, idx) => <option key={idx} value={p} />)}
              </datalist>
            </div>
          </div>

          <div className="form-group full-width">
            <label className="form-label">Исполнительный орган государственной власти (ИОГВ):</label>
            <div className="input-with-datalist">
              <input 
                type="text" 
                className="form-input" 
                value={department} 
                onChange={(e) => setDepartment(e.target.value)} 
                list="dept-datalist"
              />
              <datalist id="dept-datalist">
                {DEPARTMENTS.map((d, idx) => <option key={idx} value={d} />)}
              </datalist>
            </div>
          </div>

          <div className="form-group full-width">
            <label className="form-label">Целевой вектор развития / Цели обучения:</label>
            <input 
              type="text" 
              className="form-input" 
              value={careerGoal} 
              onChange={(e) => setCareerGoal(e.target.value)} 
              placeholder="Например: Развитие проектных навыков, клиентоцентричности и управления данными"
            />
          </div>
        </div>

        {/* Секция: История обучения */}
        <div className="history-section-card">
          <div className="section-title-row">
            <h5>История освоенных программ (будут исключены из рекомендаций):</h5>
            <span className="count-badge">{learningHistory.length} программ</span>
          </div>

          <div className="history-tags-list">
            {learningHistory.map((item, idx) => (
              <div key={idx} className={`history-chip status-${item.status === "Пройден" ? "passed" : "other"}`}>
                <span className="chip-type">{item.course_type || "ППК"}</span>
                <span className="chip-title">{item.course_name}</span>
                <span className="chip-status">({item.status || "Пройден"})</span>
                <button 
                  type="button" 
                  className="chip-remove-btn"
                  onClick={() => handleRemoveHistoryItem(idx)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {learningHistory.length === 0 && (
              <p className="muted text-sm">История обучения пуста (служащий еще не проходил курсы в КУ СПб).</p>
            )}
          </div>

          {/* Добавление курса в историю */}
          <div className="add-history-row">
            <input 
              type="text" 
              className="form-input flex-1"
              value={newCourseName}
              onChange={(e) => setNewCourseName(e.target.value)}
              placeholder="Название пройденного курса..."
              list="catalog-datalist"
            />
            <datalist id="catalog-datalist">
              {catalogList.map((c, idx) => <option key={idx} value={c.name} />)}
            </datalist>

            <select 
              className="form-select w-24"
              value={newCourseType}
              onChange={(e) => setNewCourseType(e.target.value)}
            >
              <option value="ППК">ППК</option>
              <option value="ЭК">ЭК</option>
            </select>

            <select 
              className="form-select w-32"
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
              <Plus size={16} /> Добавить
            </button>
          </div>
        </div>

        {/* Выбор модели ИИ */}
        <div className="model-selector-card">
          <label className="form-label">Группа ИИ-агентов (провайдер LLM):</label>
          <div className="models-grid">
            <div 
              className={`model-card ${selectedModel === "deepseek" ? "selected" : ""}`}
              onClick={() => setSelectedModel("deepseek")}
            >
              <div className="model-header">
                <span className="model-badge international">Зарубежная модель</span>
                <Cpu size={18} />
              </div>
              <h4>DeepSeek V3 / R1</h4>
              <p>Высокая точность сопоставления компетенций и глубокий синтез методических рекомендаций.</p>
            </div>

            <div 
              className={`model-card ${selectedModel === "gigachat" ? "selected" : ""}`}
              onClick={() => setSelectedModel("gigachat")}
            >
              <div className="model-header">
                <span className="model-badge domestic">Отечественная модель</span>
                <Cpu size={18} />
              </div>
              <h4>Sber GigaChat Pro</h4>
              <p>Оптимизирована для русского языка и стандартов государственного управления РФ.</p>
            </div>

            <div 
              className={`model-card ${selectedModel === "qwen_local" ? "selected" : ""}`}
              onClick={() => setSelectedModel("qwen_local")}
            >
              <div className="model-header">
                <span className="model-badge local">Локальная модель (llama.cpp)</span>
                <Shield size={18} />
              </div>
              <h4>Qwen Local (GGUF)</h4>
              <p>100% конфиденциальность и автономная работа на сервере организации без выхода в интернет.</p>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="error-banner">
            {errorMessage}
          </div>
        )}

        {/* Кнопка запуска с индикацией прогресса агентов */}
        <div className="constructor-actions">
          {isGenerating ? (
            <div className="generation-progress-box">
              <div className="progress-spinner">
                <RefreshCw size={24} className="spin text-primary" />
              </div>
              <div className="progress-steps-list">
                <div className={`step-item ${generationStep >= 1 ? "active" : ""}`}>
                  <span className="step-num">1</span>
                  <span>Агент 1 (competency-analyst): Анализ профиля и дефицита компетенций...</span>
                </div>
                <div className={`step-item ${generationStep >= 2 ? "active" : ""}`}>
                  <span className="step-num">2</span>
                  <span>Агент 2 (trajectory-architect): Проектирование этапов и подбор курсов...</span>
                </div>
                <div className={`step-item ${generationStep >= 3 ? "active" : ""}`}>
                  <span className="step-num">3</span>
                  <span>Агент 3 (trajectory-justifier): Бенчмаркинг и методическое обоснование...</span>
                </div>
              </div>
            </div>
          ) : (
            <button 
              className="primary-button large wide"
              onClick={handleGenerate}
            >
              <Sparkles size={18} /> Сформировать индивидуальную траекторию обучения
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
