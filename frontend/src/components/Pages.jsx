import { useState, useMemo } from "react";
import { 
  ArchiveRestore, ArrowLeft, Construction, Eye, Layers3, Monitor, Moon, PanelLeftClose, 
  PanelLeftOpen, Search, Sun, Pencil, Archive, Save, BookOpen, BarChart3, MessageSquare, 
  AlertTriangle, CheckCircle, HelpCircle, ChevronRight, ThumbsUp
} from "lucide-react";
import { buildCourseReportViewModel } from "../reportViewModel";
import { AnalyticalReportTab } from "./report/AnalyticalReportTab";
import { DashboardTab } from "./report/DashboardTab";
import { QualitativeTab } from "./report/QualitativeTab";

// ========================= Auth Page Component =========================
export function AuthPage({
  mode,
  authError,
  loginEmail,
  loginPassword,
  registerUsername,
  registerEmail,
  registerPassword,
  onLoginEmailChange,
  onLoginPasswordChange,
  onRegisterUsernameChange,
  onRegisterEmailChange,
  onRegisterPasswordChange,
  onSubmit,
  onClearError,
}) {
  const isLogin = mode === "login";

  return (
    <section className="page auth-page active" id={mode} data-title={isLogin ? "Авторизация" : "Регистрация"}>
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="eyebrow">{isLogin ? "Вход" : "Регистрация"}</p>
        <h2>{isLogin ? "Добро пожаловать" : "Создайте рабочее пространство"}</h2>
        {authError && <div className="error-box">{authError}</div>}

        {!isLogin && (
          <label>
            Имя пользователя
            <input
              type="text"
              placeholder="Ирина"
              value={registerUsername}
              onChange={(e) => onRegisterUsernameChange(e.target.value)}
              required
            />
          </label>
        )}

        <label>
          Email
          <input
            type="email"
            placeholder="name@university.ru"
            value={isLogin ? loginEmail : registerEmail}
            onChange={(e) => (isLogin ? onLoginEmailChange(e.target.value) : onRegisterEmailChange(e.target.value))}
            required
          />
        </label>

        <label>
          Пароль
          <input
            type="password"
            placeholder={isLogin ? "Пароль" : "Минимум 6 символов"}
            value={isLogin ? loginPassword : registerPassword}
            onChange={(e) => (isLogin ? onLoginPasswordChange(e.target.value) : onRegisterPasswordChange(e.target.value))}
            required
          />
        </label>

        <button type="submit" className="primary-button wide">
          {isLogin ? "Войти" : "Зарегистрироваться"}
        </button>
        <a href={isLogin ? "#register" : "#login"} onClick={onClearError}>
          {isLogin ? "Создать аккаунт" : "Уже есть аккаунт"}
        </a>
      </form>
    </section>
  );
}

// ========================= Coming Soon Page Component =========================
export function ComingSoonPage({ id, title, message }) {
  return (
    <section className="page active" id={id} data-title={title}>
      <div className="state-panel state-panel-compact">
        <span className="state-icon state-icon-warm">
          <Construction size={28} strokeWidth={2.2} />
        </span>
        <h3>Модуль «{title}» находится в разработке</h3>
        <p className="muted">{message}</p>
      </div>
    </section>
  );
}

// ========================= Settings Page Component =========================
export function SettingsPage({
  settings,
  onSettingsChange,
  sidebarWidth,
  isSidebarCollapsed,
  onSidebarToggle,
  onSidebarResizeStart,
  archivedReports = [],
  onUnarchiveReport,
}) {
  const [activeGroup, setActiveGroup] = useState("interface");
  const [archiveQuery, setArchiveQuery] = useState("");
  const accessibility = settings.accessibility || {};
  const recommendedAccessibility = {
    fontSize: "xxlarge",
    colorScheme: "dark",
  };
  const filteredArchivedReports = useMemo(() => {
    const query = archiveQuery.trim().toLowerCase();
    if (!query) return archivedReports;

    return archivedReports.filter((report) =>
      `${report.course || ""} ${report.title || ""}`.toLowerCase().includes(query)
    );
  }, [archivedReports, archiveQuery]);

  return (
    <section
      className={`settings-shell ${isSidebarCollapsed ? "settings-sidebar-collapsed" : ""}`}
      id="settings"
      data-title="Настройки"
      style={{ "--settings-sidebar-width": `${sidebarWidth}px` }}
    >
      <header className="settings-topbar">
        <a className="ghost-button settings-back" href="#upload">
          <ArrowLeft size={17} strokeWidth={2.2} />
          Назад
        </a>
        <button
          type="button"
          className="icon-action-button settings-sidebar-toggle"
          aria-label={isSidebarCollapsed ? "Показать панель настроек" : "Скрыть панель настроек"}
          title={isSidebarCollapsed ? "Показать панель настроек" : "Скрыть панель настроек"}
          onClick={onSidebarToggle}
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpen size={18} strokeWidth={2.2} />
          ) : (
            <PanelLeftClose size={18} strokeWidth={2.2} />
          )}
        </button>
      </header>
      <div className="settings-screen">
        <aside className="settings-side" aria-label="Группы настроек">
          <button
            type="button"
            className={`settings-group-button ${activeGroup === "interface" ? "active" : ""}`}
            onClick={() => setActiveGroup("interface")}
          >
            Интерфейс
          </button>
          <button
            type="button"
            className={`settings-group-button ${activeGroup === "archive" ? "active" : ""}`}
            onClick={() => setActiveGroup("archive")}
          >
            Архив
          </button>
          <button
            type="button"
            className="sidebar-resize-handle settings-resize-handle"
            aria-label="Изменить ширину панели настроек"
            onPointerDown={onSidebarResizeStart}
          ></button>
        </aside>

        <div className="settings-content">
          {activeGroup === "interface" ? (
            <>
              <div className="settings-content-heading">
                <h2>Интерфейс</h2>
              </div>

              <section className="panel settings-panel">
                <div className="settings-copy">
                  <Sun size={20} strokeWidth={2.2} />
                  <div>
                    <h3>Тема</h3>
                    <p className="muted">Выберите светлую, темную или системную тему.</p>
                  </div>
                </div>
                <div className="theme-options" role="radiogroup" aria-label="Тема интерфейса">
                  {[
                    { value: "system", label: "Системная", icon: Monitor },
                    { value: "light", label: "Светлая", icon: Sun },
                    { value: "dark", label: "Темная", icon: Moon },
                  ].map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={settings.theme === option.value ? "selected" : ""}
                        role="radio"
                        aria-checked={settings.theme === option.value}
                        onClick={() => onSettingsChange({ theme: option.value })}
                      >
                        <Icon size={17} strokeWidth={2.2} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="panel settings-panel">
                <div className="settings-copy">
                  <Eye size={20} strokeWidth={2.2} />
                  <div>
                    <h3>Режим для слабовидящих</h3>
                    <p className="muted">Включает верхнюю панель для выбора шрифта и контрастной цветовой схемы.</p>
                  </div>
                </div>
                <div className="accessibility-panel">
                  <ToggleSwitch
                    checked={accessibility.enabled}
                    ariaLabel="Режим для слабовидящих"
                    onChange={() =>
                      onSettingsChange({
                        accessibility: accessibility.enabled
                          ? { ...accessibility, enabled: false }
                          : { ...recommendedAccessibility, enabled: true },
                      })
                    }
                  />
                </div>
              </section>

              <section className="panel settings-panel">
                <div className="settings-copy">
                  <Layers3 size={20} strokeWidth={2.2} />
                  <div>
                    <h3>Минимальный интерфейс</h3>
                    <p className="muted">Скрывает вторичные подсказки и декоративные элементы, оставляя рабочие сценарии.</p>
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.minimalUi}
                  ariaLabel="Минимальный интерфейс"
                  onChange={() => onSettingsChange({ minimalUi: !settings.minimalUi })}
                />
              </section>
            </>
          ) : (
            <>
              <div className="settings-content-heading">
                <h2>Архив</h2>
              </div>

              <section className="panel archive-panel">
                <p className="muted archive-description">Здесь хранятся отчеты, скрытые из основной истории.</p>

                <label className="archive-search">
                  <Search size={18} strokeWidth={2.2} aria-hidden="true" />
                  <input
                    type="search"
                    value={archiveQuery}
                    onChange={(e) => setArchiveQuery(e.target.value)}
                    placeholder="Найти архивированный отчет"
                    aria-label="Найти архивированный отчет"
                  />
                </label>

                {filteredArchivedReports.length ? (
                  <div className="archive-list">
                    {filteredArchivedReports.map((report) => (
                      <article className="archive-item" key={report.id}>
                        <div>
                          <strong>{report.course}</strong>
                          <p className="muted">{report.title}</p>
                        </div>
                        <button
                          type="button"
                          className="icon-action-button archive-restore-button"
                          onClick={() => onUnarchiveReport?.(report.id)}
                          aria-label={`Разархивировать отчет ${report.course}`}
                          title="Разархивировать"
                        >
                          <ArchiveRestore size={17} strokeWidth={2.2} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="state-panel state-panel-compact archive-empty">
                    <h3>{archiveQuery.trim() ? "Ничего не найдено" : "Архив пуст"}</h3>
                    <p className="muted">
                      {archiveQuery.trim()
                        ? "Попробуйте изменить поисковый запрос."
                        : "Архивированные отчеты появятся здесь."}
                    </p>
                    {!archiveQuery.trim() && (
                      <a className="secondary-button state-action" href="#upload">
                        Перейти к анализу
                      </a>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ToggleSwitch({ checked, label, ariaLabel, onChange }) {
  return (
    <button
      type="button"
      className={`toggle-switch ${checked ? "checked" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || label}
      onClick={onChange}
    >
      <span className="toggle-track">
        <span className="toggle-thumb"></span>
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

// ========================= Listeners (Students) Page Component =========================
export function StudentsPage({ reports, onNewAnalysis }) {
  const [searchQuery, setSearchQuery] = useState("");

  const aggregatedData = useMemo(() => {
    let totalCount = 0;
    let scoreSum = { usefulness: 0, practicality: 0, accessibility: 0, interaction: 0 };
    let scoreCount = 0;
    let positions = { "Специалист": 0, "Руководитель": 0, "Обеспечивающий специалист": 0 };
    let formats = { "очное": 0, "смешанное": 0, "дистанционное": 0 };
    let totalDetached = 0;
    let detachedCount = 0;

    reports.forEach((report) => {
      if (report.status !== "Completed" || !report.result) return;
      const analyses = report.result.courses_analysis || [];
      analyses.forEach((course) => {
        totalCount += course.students_count || 0;
        
        // Stats
        const stats = course.statistics;
        if (stats) {
          if (stats.usefulness) { scoreSum.usefulness += stats.usefulness.average; }
          if (stats.practicality) { scoreSum.practicality += stats.practicality.average; }
          if (stats.accessibility) { scoreSum.accessibility += stats.accessibility.average; }
          if (stats.interaction) { scoreSum.interaction += stats.interaction.average; }
          scoreCount++;

          if (stats.involvement) {
            totalDetached += stats.involvement.detached_percent;
            detachedCount++;
          }
        }

        // Positions
        if (course.position_distribution) {
          Object.entries(course.position_distribution).forEach(([pos, count]) => {
            const cleanPos = pos.includes("Специалист") && !pos.includes("Обеспечивающий") ? "Специалист" : pos;
            if (positions[cleanPos] !== undefined) {
              positions[cleanPos] += count;
            } else {
              positions[cleanPos] = (positions[cleanPos] || 0) + count;
            }
          });
        }

        // Formats
        if (course.preferred_formats) {
          Object.entries(course.preferred_formats).forEach(([fmt, count]) => {
            let key = "очное";
            if (fmt.toLowerCase().includes("смешан")) key = "смешанное";
            if (fmt.toLowerCase().includes("дистанц") || fmt.toLowerCase().includes("онлайн")) key = "дистанционное";
            formats[key] += count;
          });
        }
      });
    });

    const averageSatisfaction = scoreCount > 0 
      ? ((scoreSum.usefulness + scoreSum.practicality + scoreSum.accessibility + scoreSum.interaction) / (4 * scoreCount)).toFixed(1) 
      : "0";
    
    const averageDetached = detachedCount > 0 ? (totalDetached / detachedCount).toFixed(1) : "0";

    return {
      totalCount,
      averageSatisfaction,
      averageDetached,
      positions,
      formats
    };
  }, [reports]);

  const courseList = useMemo(() => {
    const list = [];
    reports.forEach((report) => {
      if (report.status !== "Completed" || !report.result) return;
      const analyses = report.result.courses_analysis || [];
      analyses.forEach((course) => {
        const stats = course.statistics;
        const avgScore = stats 
          ? ((stats.usefulness?.average + stats.practicality?.average + stats.accessibility?.average + stats.interaction?.average) / 4).toFixed(1)
          : "0.0";
        list.push({
          id: report.id,
          name: course.course_name,
          period: course.period,
          students: course.students_count,
          avgScore,
          detached: stats?.involvement?.detached_percent || 0,
          topTopic: course.text_analysis?.top_topics?.[0]?.topic || "Не определена"
        });
      });
    });
    return list;
  }, [reports]);

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return courseList;
    return courseList.filter(c => c.name.toLowerCase().includes(q) || c.topTopic.toLowerCase().includes(q));
  }, [courseList, searchQuery]);

  return (
    <section className="page active" id="students" data-title="Слушатели">
      <section className="panel students-intro">
        <div className="text-stack">
          <p className="eyebrow">Кабинет методиста</p>
          <h2>Слушатели и курсы</h2>
          <p className="muted">
            Сводные аналитические данные по всем опросам из истории. Индикаторы удовлетворенности, распределение категорий слушателей и форматы обучения.
          </p>
        </div>
        <span className="badge">Все данные</span>
      </section>

      {reports.length === 0 ? (
        <section className="state-panel">
          <h2>Пока нет обработанных данных</h2>
          <p className="muted">Загрузите файлы отзывов, чтобы сформировать сводный профиль слушателей.</p>
          <button className="primary-button state-action" type="button" onClick={onNewAnalysis}>
            Новый анализ
          </button>
        </section>
      ) : (
        <>
          <section className="metrics-grid" aria-label="Сводные метрики слушателей">
            <div className="metric-card">
              <span>Слушателей охвачено</span>
              <strong>{aggregatedData.totalCount}</strong>
              <small>человек по опросам</small>
            </div>
            <div className="metric-card normal">
              <span>Удовлетворенность</span>
              <strong>{aggregatedData.averageSatisfaction} / 10</strong>
              <small>средняя по 4 критериям</small>
            </div>
            <div className="metric-card risk">
              <span>Отстраненность (Detached)</span>
              <strong>{aggregatedData.averageDetached}%</strong>
              <small>чувствовали скуку/отрыв</small>
            </div>
          </section>

          <div className="grid two students-breakdown-grid">
            <section className="panel">
              <h3>Категории слушателей</h3>
              <div className="stats-breakdown" style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" }}>
                {Object.entries(aggregatedData.positions).map(([pos, count]) => {
                  const total = Math.max(Object.values(aggregatedData.positions).reduce((a, b) => a + b, 0), 1);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={pos} className="breakdown-row">
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "var(--font-size-sm)" }}>
                        <span><b>{pos}</b></span>
                        <span className="muted">{count} чел. ({pct}%)</span>
                      </div>
                      <div style={{ background: "var(--border-color)", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, background: "var(--accent-color)", height: "100%" }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <h3>Предпочитаемые форматы обучения</h3>
              <div className="stats-breakdown" style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" }}>
                {Object.entries(aggregatedData.formats).map(([format, count]) => {
                  const total = Math.max(Object.values(aggregatedData.formats).reduce((a, b) => a + b, 0), 1);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={format} className="breakdown-row">
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "var(--font-size-sm)" }}>
                        <span style={{ textTransform: "capitalize" }}><b>{format}</b></span>
                        <span className="muted">{pct}%</span>
                      </div>
                      <div style={{ background: "var(--border-color)", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, background: "var(--accent-color)", height: "100%" }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="panel students-course-panel">
            <div className="section-heading students-course-heading">
              <h3>Базы опросов по курсам</h3>
              <div className="control-search students-course-search">
                <Search size={16} strokeWidth={2.2} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по курсу или теме"
                />
              </div>
            </div>

            <div className="table-wrap">
              <table className="course-table">
                <thead>
                  <tr>
                    <th>Название курса</th>
                    <th>Период</th>
                    <th>Анкет</th>
                    <th>Ср. Оценка</th>
                    <th>Отстраненные</th>
                    <th>Ключевая тема</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((c, i) => (
                    <tr key={i}>
                      <td><b>{c.name}</b></td>
                      <td>{c.period}</td>
                      <td>{c.students}</td>
                      <td>
                        <span className={`score-pill ${Number(c.avgScore) >= 8.0 ? "good" : "watch"}`}>
                          {c.avgScore}
                        </span>
                      </td>
                      <td>{c.detached}%</td>
                      <td className="muted">{c.topTopic}</td>
                      <td>
                        <a href={`#report-detail-${c.id}`} className="table-link">
                          Открыть <ChevronRight size={14} />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {filteredCourses.length === 0 && (
                    <tr>
                      <td colSpan="7" className="table-empty">Ничего не найдено.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

// ========================= Course Report Details Component =========================
export function CourseReportDetailPage({
  report,
  isEditingTitle,
  editTitleValue,
  setEditTitleValue,
  setIsEditingTitle,
  handleInlineRenameSubmit,
  handleArchiveReport,
  isSaveMenuOpen,
  setIsSaveMenuOpen,
  isProfileMenuOpen,
  setIsProfileMenuOpen,
  handleExportReport,
  saveActionsRef,
}) {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard, qualitative, report
  const [qualActiveTab, setQualActiveTab] = useState("topics"); // topics, sentiment, problems, quotes, recommendations
  const exportFormats = [
    { key: "pdf", label: "PDF" },
    { key: "docx", label: "DOCX" },
    { key: "excel", label: "Excel" },
    { key: "csv", label: "CSV" },
    { key: "json", label: "JSON" },
  ];

  const reportViewModel = buildCourseReportViewModel(report);
  const {
    reportData,
    textAnalysis,
    courseName,
    period,
    studentsCount,
  } = reportViewModel;

  return (
    <section className="page active" id="report-detail" data-title="Детали отчёта">
      <div className="report-header">
        <div>
          {isEditingTitle ? (
            <form onSubmit={handleInlineRenameSubmit} className="inline-rename-form">
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                className="inline-rename-input"
                required
                autoFocus
              />
              <button type="submit" className="primary-button inline-rename-button">
                Сохранить
              </button>
              <button
                type="button"
                className="ghost-button inline-rename-button"
                onClick={() => setIsEditingTitle(false)}
              >
                Отмена
              </button>
            </form>
          ) : (
            <div className="report-title-row">
              <p className="eyebrow" id="report-course-eyebrow">{courseName}</p>
              <button
                type="button"
                className="inline-icon-button"
                onClick={() => {
                  setEditTitleValue(courseName);
                  setIsEditingTitle(true);
                }}
                aria-label="Переименовать отчет"
                title="Переименовать отчет"
              >
                <Pencil size={14} strokeWidth={2.2} />
              </button>
            </div>
          )}
          <h2 id="report-title-heading">{report.title}</h2>
          <p className="muted report-meta-line">
            Период: <b>{period}</b> · Анкетировано слушателей: <b>{studentsCount} чел.</b>
          </p>
        </div>

        <div className="export-actions">
          <button
            type="button"
            className="icon-action-button archive-action"
            onClick={() => handleArchiveReport(report.id)}
            aria-label="Архивировать"
            title="Архивировать"
          >
            <Archive size={18} strokeWidth={2.2} />
          </button>
          <div className="save-actions" ref={saveActionsRef}>
            <button
              type="button"
              className="icon-action-button save-action"
              onClick={() => {
                setIsProfileMenuOpen(false);
                setIsSaveMenuOpen((isOpen) => !isOpen);
              }}
              aria-expanded={isSaveMenuOpen}
              aria-haspopup="menu"
              aria-label="Сохранить"
              title="Сохранить"
            >
              <Save size={18} strokeWidth={2.2} />
            </button>
            {isSaveMenuOpen && (
              <div className="save-menu" role="menu">
                {exportFormats.map((format) => (
                  <button
                    key={format.key}
                    type="button"
                    role="menuitem"
                    onClick={() => handleExportReport(report, format.key)}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <nav className="report-tabs" aria-label="Разделы отчета">
        {[
          { key: "dashboard", label: "Панель показателей", icon: BarChart3 },
          { key: "qualitative", label: "Качественный анализ отзывов", icon: MessageSquare },
          { key: "report", label: "Аналитическая справка", icon: BookOpen }
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              className={`tab-btn ${activeTab === t.key ? "active" : ""}`}
              onClick={() => setActiveTab(t.key)}
              title={t.label}
            >
              <Icon size={16} />
              <span className="tab-label">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tab 1: Dashboard Panel */}
      {activeTab === "dashboard" && <DashboardTab viewModel={reportViewModel} />}

      {/* Tab 2: Qualitative Insights */}
      {activeTab === "qualitative" && (
        <QualitativeTab
          textAnalysis={textAnalysis}
          activeTab={qualActiveTab}
          onTabChange={setQualActiveTab}
          sourceLimitation={reportViewModel.limitations.sourceEvidence}
        />
      )}

      {/* Tab 3: Analytical Document View */}
      {activeTab === "report" && <AnalyticalReportTab reportData={reportData} />}
    </section>
  );
}
