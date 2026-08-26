import { useEffect, useRef, useState } from "react";
import { 
  CheckCircle2, Clock, BookOpen, Sparkles,
  ArrowUpRight, Shield, Zap, TrendingUp, Info, X, AlertTriangle
} from "lucide-react";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from "recharts";

const asList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
};

const getCourseEvidence = (course) => {
  const sources = asList(course.evidence_sources || course.sources || course.source);
  const benchmark = course.benchmark || course.colleague_benchmark || course.cohort_evidence;
  const limitations = asList(course.limitations || course.data_limitations);

  return {
    sources,
    benchmark,
    limitations,
    hasEvidence: sources.length > 0 || Boolean(benchmark),
  };
};

const formatBenchmarkEvidence = (benchmark) => {
  if (!benchmark) return [];
  if (typeof benchmark === "string") return [benchmark];
  if (typeof benchmark !== "object") return [String(benchmark)];

  const labels = {
    scope: "Когорта",
    cohort_scope: "Когорта",
    cohort_size: "Размер выборки",
    sample_size: "Размер выборки",
    colleagues_count: "Количество коллег",
    records_count: "Количество записей",
    matched_records: "Подходящих записей",
    coverage_pct: "Охват",
    popularity_pct: "Популярность",
    success_rate: "Успешность",
  };
  return Object.entries(benchmark)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 8)
    .map(([key, value]) => `${labels[key] || key.replaceAll("_", " ")}: ${value}${key.endsWith("_pct") ? "%" : ""}`);
};

export function TrajectoryRoadmap({ trajectory, onExportPdf, onExportXlsx, onExportJson, exportDisabled = false }) {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [activeStageTab, setActiveStageTab] = useState("all");
  const modalRef = useRef(null);
  const modalCloseRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!selectedCourse) return undefined;

    const previouslyFocused = previouslyFocusedRef.current;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedCourse(null);
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = Array.from(modalRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    modalCloseRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [selectedCourse]);

  if (!trajectory) {
    return (
      <div className="empty-state">
        <BookOpen size={48} className="text-muted" />
        <h3>Траектория не выбрана</h3>
        <p className="muted">Сформируйте новую траекторию или выберите сохраненную из истории.</p>
      </div>
    );
  }

  const stages = trajectory.stages || [];
  const radarData = (trajectory.competency_radar || []).map((r) => ({
    subject: r.competency,
    current: r.current_level,
    target: r.target_level,
    fullMark: 100,
  }));
  const benchmark = trajectory.colleague_benchmark || null;
  const trajectoryLimitations = [
    ...asList(trajectory.limitations),
    ...asList(trajectory.data_limitations),
    ...asList(benchmark?.limitations),
  ];
  const benchmarkScope = benchmark?.scope || benchmark?.cohort_scope || "Не указан";
  const benchmarkSize = benchmark?.cohort_size || benchmark?.sample_size || benchmark?.colleagues_count;
  const hasConfirmedBenchmark = Boolean(benchmark && Number(benchmarkSize) > 0 && benchmarkScope !== "Не указан");

  const filteredStages = activeStageTab === "all" 
    ? stages 
    : stages.filter(s => String(s.stage_number) === activeStageTab);

  const totalCourses = stages.reduce((acc, s) => acc + (s.courses?.length || 0), 0);
  const totalHours = stages.reduce((acc, s) => acc + (s.courses || []).reduce((h, c) => h + (Number(c.duration_hours) || 0), 0), 0);

  return (
    <div className="trajectory-container">
      {/* Шапка траектории */}
      <div className="trajectory-header-card">
        <div className="header-top">
          <div className="trajectory-title-block">
            <p className="eyebrow">ИОТ · каталог 2025</p>
            <h2>Индивидуальная траектория</h2>
          </div>
          <div className="export-actions">
            <button className="secondary-button compact" onClick={onExportPdf} title="Скачать PDF" disabled={exportDisabled}>
              PDF
            </button>
            <button className="secondary-button compact" onClick={onExportXlsx} title="Скачать Excel" disabled={exportDisabled}>
              Excel (.xlsx)
            </button>
            <button className="secondary-button compact" onClick={onExportJson} title="Экспорт JSON" disabled={exportDisabled}>
              JSON
            </button>
          </div>
        </div>

        <div className="employee-info-banner">
          <div>
            <h2 className="employee-name">{trajectory.employee_name || "ФИО не указано"}</h2>
            <p className="employee-meta">
              <strong>{trajectory.position}</strong> • {trajectory.department}
            </p>
          </div>
          <div className="trajectory-stats-summary">
            <div className="stat-pill">
              <span className="stat-val">{stages.length}</span>
              <span className="stat-lbl">этапа</span>
            </div>
            <div className="stat-pill">
              <span className="stat-val">{totalCourses}</span>
              <span className="stat-lbl">курсов</span>
            </div>
            <div className="stat-pill">
              <span className="stat-val">{totalHours || "—"}</span>
              <span className="stat-lbl">ак. часов</span>
            </div>
          </div>
        </div>

        {trajectory.summary && (
          <div className="ai-summary-box">
            <div className="ai-summary-title">
              <Sparkles size={16} className="text-accent" />
              <span>Краткий итог</span>
            </div>
            <p className="ai-summary-text">{trajectory.summary}</p>
          </div>
        )}

        {trajectoryLimitations.length > 0 && (
          <div className="trajectory-warning-box">
            <AlertTriangle size={17} />
            <div>
              <strong>Есть ограничения данных</strong>
              <p>Учитывайте их перед использованием результата.</p>
              <details className="trajectory-limitations-details">
                <summary>Показать все ({trajectoryLimitations.length})</summary>
                <ul>
                  {trajectoryLimitations.map((limitation, index) => (
                    <li key={index}>{limitation}</li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        )}

        {/* Переключатели этапов */}
        <div className="stage-filter-tabs">
          <button 
            type="button"
            className={`stage-tab ${activeStageTab === "all" ? "active" : ""}`}
            aria-pressed={activeStageTab === "all"}
            onClick={() => setActiveStageTab("all")}
          >
            Все этапы ({stages.length})
          </button>
          {stages.map((st) => (
            <button
              type="button"
              key={st.stage_number}
              className={`stage-tab ${activeStageTab === String(st.stage_number) ? "active" : ""}`}
              aria-pressed={activeStageTab === String(st.stage_number)}
              onClick={() => setActiveStageTab(String(st.stage_number))}
            >
              Этап {st.stage_number}: {st.recommended_period || ""}
            </button>
          ))}
        </div>
      </div>

      <div className="trajectory-grid-layout">
        {/* Левая колонка: Роадмап этапов и курсов */}
        <div className="roadmap-main-column">
          {filteredStages.map((stage, idx) => (
            <div key={stage.stage_number || idx} className="stage-card">
              <div className="stage-card-header">
                <div className="stage-num-badge">{stage.stage_number || idx + 1}</div>
                <div className="stage-title-group">
                  <h3 className="stage-title">{stage.stage_title}</h3>
                  {stage.stage_goal && <p className="stage-goal">{stage.stage_goal}</p>}
                </div>
                {stage.recommended_period && (
                  <span className="stage-period-pill">
                    <Clock size={13} /> {stage.recommended_period}
                  </span>
                )}
              </div>

              <div className="courses-grid">
                {(stage.courses || []).map((course, cIdx) => {
                  const isEK = course.type === "ЭК";
                  return (
                    <button
                      type="button"
                      key={course.course_id || cIdx} 
                      className="course-card-interactive"
                      onClick={(event) => {
                        previouslyFocusedRef.current = event.currentTarget;
                        setSelectedCourse(course);
                      }}
                      aria-label={`Открыть программу: ${course.course_name}`}
                    >
                      <div className="course-card-top">
                        <div className="course-type-badges">
                          <span className={`type-tag ${isEK ? "type-ek" : course.type === "ППК" ? "type-ppk" : ""}`}>
                            {course.type || "Не указан"}
                          </span>
                          <span className="hours-tag">
                            <Clock size={12} /> {course.duration_hours ? `${course.duration_hours} ч.` : "не указано"}
                          </span>
                          {course.priority && (
                            <span className={`priority-tag priority-${course.priority.toLowerCase()}`}>
                              {course.priority}
                            </span>
                          )}
                        </div>
                        <ArrowUpRight size={16} className="course-card-arrow" />
                      </div>

                      <h4 className="course-card-title">{course.course_name}</h4>

                      {course.justification && (
                        <div className="course-justification-preview">
                          <Zap size={13} className="text-warning mr-1 flex-shrink-0" />
                          <span>{course.justification.slice(0, 110)}...</span>
                        </div>
                      )}

                      <div className={`course-evidence-row ${getCourseEvidence(course).hasEvidence ? "has-evidence" : "missing-evidence"}`}>
                        <Info size={13} />
                        <span>
                          {getCourseEvidence(course).hasEvidence
                            ? "Есть источник рекомендации"
                            : "Источник рекомендации не передан"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Правая колонка: Радар компетенций и Бенчмарк */}
        <div className="roadmap-sidebar-column">
          {/* Радар компетенций */}
          {radarData.length > 0 ? (
            <div className="sidebar-widget-card">
              <div className="widget-header">
                <TrendingUp size={18} className="text-primary" />
                <h4>Матрица развития компетенций</h4>
              </div>
              <div className="radar-chart-wrapper" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="70%">
                    <PolarGrid stroke="var(--line)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "var(--text-soft)" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--muted)" }} stroke="var(--line)" />
                    <Radar name="Текущий уровень" dataKey="current" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.35} />
                    <Radar name="Целевой уровень" dataKey="target" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.45} />
                    <Tooltip 
                      contentStyle={{ 
                        background: "var(--surface)", 
                        borderColor: "var(--line)", 
                        color: "var(--heading)", 
                        borderRadius: "8px",
                        boxShadow: "var(--shadow)"
                      }} 
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="radar-legend">
                <span className="legend-item"><span className="dot dot-current" /> Текущий уровень</span>
                <span className="legend-item"><span className="dot dot-target" /> Целевой уровень</span>
              </div>
            </div>
          ) : (
            <div className="sidebar-widget-card data-limitation-card">
              <div className="widget-header">
                <AlertTriangle size={18} className="text-warning" />
                <h4>Матрица компетенций недоступна</h4>
              </div>
              <p className="widget-subtext">
                Backend не передал подтвержденные уровни компетенций. Радар не строится, чтобы не показывать расчет без источника данных.
              </p>
            </div>
          )}

          {/* Бенчмарк коллег */}
          {hasConfirmedBenchmark ? (
            <div className="sidebar-widget-card">
              <div className="widget-header">
                <Shield size={18} className="text-accent" />
                <h4>Бенчмарк коллег</h4>
              </div>
              <p className="widget-subtext">
                Статистика по когорте <strong>{benchmarkScope}</strong>: {trajectory.position}
                {trajectory.department ? `, ${trajectory.department}` : ""}.
                {benchmarkSize ? ` Выборка: ${benchmarkSize}.` : " Размер выборки backend не передал."}
              </p>
              <div className="colleague-courses-list">
                {(benchmark.top_recommended_for_position || benchmark.top_recommended_for_cohort || []).slice(0, 5).map((bc, bIdx) => (
                  <div key={bIdx} className="benchmark-item">
                    <div className="bench-course-header">
                      <span className="bench-course-title">{bc.course_name}</span>
                      <span className="bench-pct">
                        {bc.popularity_pct === undefined || bc.popularity_pct === null ? "не указано" : `${bc.popularity_pct}%`}
                      </span>
                    </div>
                    {typeof bc.popularity_pct === "number" && (
                      <div className="bench-bar-track">
                        <div
                          className="bench-bar-fill"
                          style={{ width: `${Math.min(100, Math.max(0, bc.popularity_pct))}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="sidebar-widget-card data-limitation-card">
              <div className="widget-header">
                <AlertTriangle size={18} className="text-warning" />
                <h4>Бенчмарк не подтвержден</h4>
              </div>
              <p className="widget-subtext">
                Для production-сценария нужен расчет по сочетанию должности и ИОГВ. В текущем ответе источник бенчмарка отсутствует.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно курса с полными деталями и обоснованием */}
      {selectedCourse && (
        <div className="modal-backdrop" onClick={() => setSelectedCourse(null)}>
          <div ref={modalRef} className="course-modal-content" role="dialog" aria-modal="true" aria-labelledby="trajectory-course-title" onClick={(e) => e.stopPropagation()}>
            <button ref={modalCloseRef} type="button" className="modal-close-btn" onClick={() => setSelectedCourse(null)} aria-label="Закрыть карточку программы">
              <X size={20} />
            </button>

            <div className="modal-type-header">
              <span className={`type-tag ${selectedCourse.type === "ЭК" ? "type-ek" : selectedCourse.type === "ППК" ? "type-ppk" : ""}`}>
                {selectedCourse.type === "ЭК"
                  ? "Электронный курс (ЭК)"
                  : selectedCourse.type === "ППК"
                    ? "Программа повышения квалификации (ППК)"
                    : "Тип не указан"}
              </span>
              <span className="hours-tag"><Clock size={13} /> {selectedCourse.duration_hours ? `${selectedCourse.duration_hours} ак. ч.` : "не указано"}</span>
              <span className="status-tag"><CheckCircle2 size={13} /> {selectedCourse.status || "Статус не указан"}</span>
            </div>

            <h2 className="modal-course-title" id="trajectory-course-title">{selectedCourse.course_name}</h2>

            {selectedCourse.annotation && (
              <div className="modal-section">
                <h3>Аннотация курса:</h3>
                <p className="modal-text">{selectedCourse.annotation}</p>
              </div>
            )}

            {selectedCourse.learning_outcomes && (
              <div className="modal-section">
                <h3>Результаты освоения (знать, уметь, владеть):</h3>
                <div className="modal-text results-box">{selectedCourse.learning_outcomes}</div>
              </div>
            )}

            {selectedCourse.competencies && selectedCourse.competencies.length > 0 && (
              <div className="modal-section">
                <h3>Развиваемые компетенции:</h3>
                <div className="modal-comp-tags">
                  {selectedCourse.competencies.map((comp, idx) => (
                    <span key={idx} className="comp-tag-pill">{comp}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedCourse.justification && (
              <div className="modal-section ai-justification-section">
                <h3>
                  <Sparkles size={16} className="text-accent mr-1" />
                  Обоснование рекомендации ИИ-методолога:
                </h3>
                <div className="justification-callout">
                  {selectedCourse.justification}
                </div>
              </div>
            )}

            <div className="modal-section">
              <h3>Источник и ограничения:</h3>
              {getCourseEvidence(selectedCourse).hasEvidence ? (
                <div className="evidence-detail-list">
                  {getCourseEvidence(selectedCourse).sources.map((source, index) => (
                    <span key={`source-${index}`} className="evidence-chip">{source}</span>
                  ))}
                  {formatBenchmarkEvidence(getCourseEvidence(selectedCourse).benchmark).map((item, index) => (
                    <p className="modal-text" key={`benchmark-${index}`}>{item}</p>
                  ))}
                </div>
              ) : (
                <p className="modal-text warning-text">
                  Backend не передал источник рекомендации. Для приемки нужен evidence по профилю, истории обучения, курсу и когорте должность + ИОГВ.
                </p>
              )}
              {getCourseEvidence(selectedCourse).limitations.map((limitation, index) => (
                <p key={index} className="modal-text warning-text">{limitation}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
