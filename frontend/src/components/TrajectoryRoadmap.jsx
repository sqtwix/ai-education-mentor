import React, { useState } from "react";
import { 
  CheckCircle2, Clock, Award, BookOpen, Sparkles, ChevronRight, 
  ExternalLink, Layers, ArrowUpRight, Shield, Zap, TrendingUp, Info, X
} from "lucide-react";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from "recharts";

export function TrajectoryRoadmap({ trajectory, onExportPdf, onExportXlsx, onExportJson }) {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [activeStageTab, setActiveStageTab] = useState("all");

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

  const filteredStages = activeStageTab === "all" 
    ? stages 
    : stages.filter(s => String(s.stage_number) === activeStageTab);

  const totalCourses = stages.reduce((acc, s) => acc + (s.courses?.length || 0), 0);
  const totalHours = stages.reduce((acc, s) => acc + (s.courses || []).reduce((h, c) => h + (c.duration_hours || 16), 0), 0);

  return (
    <div className="trajectory-container">
      {/* Шапка траектории */}
      <div className="trajectory-header-card">
        <div className="header-top">
          <div className="badge-group">
            <span className="badge badge-primary">
              <Sparkles size={14} className="mr-1" /> Индивидуальная траектория обучения (ИОТ)
            </span>
            <span className="badge badge-outline">2025</span>
          </div>
          <div className="export-actions">
            <button className="secondary-button compact" onClick={onExportPdf} title="Скачать PDF">
              PDF
            </button>
            <button className="secondary-button compact" onClick={onExportXlsx} title="Скачать Excel">
              Excel (.xlsx)
            </button>
            <button className="secondary-button compact" onClick={onExportJson} title="Экспорт JSON">
              JSON
            </button>
          </div>
        </div>

        <div className="employee-info-banner">
          <div>
            <h2 className="employee-name">{trajectory.employee_name || "Государственный гражданский служащий"}</h2>
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
              <span className="stat-val">{totalHours}</span>
              <span className="stat-lbl">ак. часов</span>
            </div>
          </div>
        </div>

        {trajectory.summary && (
          <div className="ai-summary-box">
            <div className="ai-summary-title">
              <Sparkles size={16} className="text-accent" />
              <span>Методическое заключение ИИ-экспертов</span>
            </div>
            <p className="ai-summary-text">{trajectory.summary}</p>
          </div>
        )}

        {/* Переключатели этапов */}
        <div className="stage-filter-tabs">
          <button 
            className={`stage-tab ${activeStageTab === "all" ? "active" : ""}`}
            onClick={() => setActiveStageTab("all")}
          >
            Все этапы ({stages.length})
          </button>
          {stages.map((st) => (
            <button
              key={st.stage_number}
              className={`stage-tab ${activeStageTab === String(st.stage_number) ? "active" : ""}`}
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
                    <div 
                      key={course.course_id || cIdx} 
                      className="course-card-interactive"
                      onClick={() => setSelectedCourse(course)}
                    >
                      <div className="course-card-top">
                        <div className="course-type-badges">
                          <span className={`type-tag ${isEK ? "type-ek" : "type-ppk"}`}>
                            {course.type || "ППК"}
                          </span>
                          <span className="hours-tag">
                            <Clock size={12} /> {course.duration_hours || 16} ч.
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

                      {course.annotation && (
                        <p className="course-card-annotation">
                          {course.annotation.slice(0, 130)}...
                        </p>
                      )}

                      {course.competencies && course.competencies.length > 0 && (
                        <div className="course-competencies-list">
                          {course.competencies.slice(0, 3).map((comp, compIdx) => (
                            <span key={compIdx} className="comp-chip">{comp}</span>
                          ))}
                          {course.competencies.length > 3 && (
                            <span className="comp-chip-more">+{course.competencies.length - 3}</span>
                          )}
                        </div>
                      )}

                      {course.justification && (
                        <div className="course-justification-preview">
                          <Zap size={13} className="text-warning mr-1 flex-shrink-0" />
                          <span>{course.justification.slice(0, 110)}...</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Правая колонка: Радар компетенций и Бенчмарк */}
        <div className="roadmap-sidebar-column">
          {/* Радар компетенций */}
          {radarData.length > 0 && (
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
          )}

          {/* Бенчмарк коллег */}
          {trajectory.colleague_benchmark && (
            <div className="sidebar-widget-card">
              <div className="widget-header">
                <Shield size={18} className="text-accent" />
                <h4>Бенчмарк по должности</h4>
              </div>
              <p className="widget-subtext">
                Статистика по коллегам в должности <strong>{trajectory.position}</strong>:
              </p>
              <div className="colleague-courses-list">
                {(trajectory.colleague_benchmark.top_recommended_for_position || []).slice(0, 5).map((bc, bIdx) => (
                  <div key={bIdx} className="benchmark-item">
                    <div className="bench-course-header">
                      <span className="bench-course-title">{bc.course_name}</span>
                      <span className="bench-pct">{bc.popularity_pct}%</span>
                    </div>
                    <div className="bench-bar-track">
                      <div 
                        className="bench-bar-fill" 
                        style={{ width: `${Math.min(100, bc.popularity_pct)}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно курса с полными деталями и обоснованием */}
      {selectedCourse && (
        <div className="modal-backdrop" onClick={() => setSelectedCourse(null)}>
          <div className="course-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedCourse(null)}>
              <X size={20} />
            </button>

            <div className="modal-type-header">
              <span className={`type-tag ${selectedCourse.type === "ЭК" ? "type-ek" : "type-ppk"}`}>
                {selectedCourse.type === "ЭК" ? "Электронный курс (ЭК)" : "Программа повышения квалификации (ППК)"}
              </span>
              <span className="hours-tag"><Clock size={13} /> {selectedCourse.duration_hours || 16} ак. ч.</span>
              <span className="status-tag"><CheckCircle2 size={13} /> {selectedCourse.status || "Рекомендован"}</span>
            </div>

            <h2 className="modal-course-title">{selectedCourse.course_name}</h2>

            {selectedCourse.annotation && (
              <div className="modal-section">
                <h5>Аннотация курса:</h5>
                <p className="modal-text">{selectedCourse.annotation}</p>
              </div>
            )}

            {selectedCourse.learning_outcomes && (
              <div className="modal-section">
                <h5>Результаты освоения (знать, уметь, владеть):</h5>
                <div className="modal-text results-box">{selectedCourse.learning_outcomes}</div>
              </div>
            )}

            {selectedCourse.competencies && selectedCourse.competencies.length > 0 && (
              <div className="modal-section">
                <h5>Развиваемые компетенции:</h5>
                <div className="modal-comp-tags">
                  {selectedCourse.competencies.map((comp, idx) => (
                    <span key={idx} className="comp-tag-pill">{comp}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedCourse.justification && (
              <div className="modal-section ai-justification-section">
                <h5>
                  <Sparkles size={16} className="text-accent mr-1" />
                  Обоснование рекомендации ИИ-методолога:
                </h5>
                <div className="justification-callout">
                  {selectedCourse.justification}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
