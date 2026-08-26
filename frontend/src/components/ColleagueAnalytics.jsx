import React, { useEffect, useMemo, useState } from "react";
import { Award, BarChart3, BookOpen, CheckCircle2, RefreshCw, TrendingUp, Users, X, XCircle } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { getBenchmarks, isAuthExpiredError } from "../api";
import { UnifiedDropdown } from "./UnifiedDropdown";

const employeeCountLabel = (count) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "сотрудников";
  if (mod10 === 1) return "сотрудник";
  if (mod10 >= 2 && mod10 <= 4) return "сотрудника";
  return "сотрудников";
};

const recordCountLabel = (count) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "записей";
  if (mod10 === 1) return "запись";
  if (mod10 >= 2 && mod10 <= 4) return "записи";
  return "записей";
};

const formatNumber = new Intl.NumberFormat("ru-RU");
const formatPercent = (value) => `${new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
}).format(Number(value) || 0)}%`;

const summarizePosition = (positionData) => {
  const courses = Object.values(positionData?.courses || {});
  const records = courses.reduce((total, course) => total + (Number(course.total_taken) || 0), 0);
  const passed = courses.reduce((total, course) => total + (Number(course.total_passed) || 0), 0);
  return {
    employees: Number(positionData?.total_employees) || 0,
    records,
    passed,
    programs: courses.length,
    completionRate: records ? (passed / records) * 100 : 0,
  };
};

export function ColleagueAnalytics({ notify }) {
  const [benchmarksData, setBenchmarksData] = useState({});
  const [selectedPosition, setSelectedPosition] = useState("");
  const [totalRecords, setTotalRecords] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [comparisonPosition, setComparisonPosition] = useState("");
  const [comparisonRevision, setComparisonRevision] = useState(0);

  useEffect(() => {
    async function loadBenchmarks() {
      try {
        setIsLoading(true);
        setLoadError("");
        const data = await getBenchmarks({ force: reloadKey > 0 });
        const byPosition = data?.benchmarks_by_position || {};
        setBenchmarksData(byPosition);
        setTotalRecords(Number(data?.total_records) || 0);
        setSelectedPosition((current) => current && byPosition[current]
          ? current
          : Object.keys(byPosition)[0] || "");
        if (reloadKey > 0) {
          notify?.({ type: "success", title: "Аналитика обновлена" });
        }
      } catch (err) {
        if (isAuthExpiredError(err)) return;
        console.error("Failed to load benchmarks:", err);
        const message = err.message || "Не удалось получить данные аналитики.";
        setLoadError(message);
        notify?.({
          type: "error",
          title: "Аналитика не загрузилась",
          message,
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadBenchmarks();
  }, [notify, reloadKey]);

  const positionsList = Object.keys(benchmarksData);

  const datasetEmployeeCount = useMemo(() => Object.values(benchmarksData).reduce(
    (total, position) => total + (Number(position?.total_employees) || 0),
    0,
  ), [benchmarksData]);

  const currentPosData = useMemo(() => benchmarksData[selectedPosition] || {
    total_employees: 0,
    courses: {},
  }, [benchmarksData, selectedPosition]);

  const allPositionCourses = useMemo(
    () => Object.values(currentPosData.courses || {}),
    [currentPosData],
  );

  const topCourses = useMemo(() => [...allPositionCourses]
    .sort((a, b) => (
      (Number(b.popularity_pct) || 0) - (Number(a.popularity_pct) || 0)
      || (Number(b.total_taken) || 0) - (Number(a.total_taken) || 0)
      || String(a.course_name).localeCompare(String(b.course_name), "ru")
    ))
    .slice(0, 10), [allPositionCourses]);

  const positionRecordCount = useMemo(() => allPositionCourses.reduce(
    (total, course) => total + (Number(course.total_taken) || 0),
    0,
  ), [allPositionCourses]);

  const passedRecordCount = useMemo(() => allPositionCourses.reduce(
    (total, course) => total + (Number(course.total_passed) || 0),
    0,
  ), [allPositionCourses]);

  const completionRate = positionRecordCount
    ? (passedRecordCount / positionRecordCount) * 100
    : 0;

  const completionData = useMemo(() => [
    { name: "Успешно завершено", value: passedRecordCount, color: "var(--accent)" },
    {
      name: "Без успешного завершения",
      value: Math.max(0, positionRecordCount - passedRecordCount),
      color: "var(--line)",
    },
  ].filter((item) => item.value > 0), [passedRecordCount, positionRecordCount]);

  const comparisonSummary = useMemo(
    () => comparisonPosition ? summarizePosition(benchmarksData[comparisonPosition]) : null,
    [benchmarksData, comparisonPosition],
  );

  const currentSummary = useMemo(() => summarizePosition(currentPosData), [currentPosData]);

  const comparisonPosData = useMemo(
    () => comparisonPosition ? benchmarksData[comparisonPosition] : null,
    [benchmarksData, comparisonPosition],
  );

  const comparisonCourses = useMemo(
    () => Object.values(comparisonPosData?.courses || {}),
    [comparisonPosData],
  );

  const chartCourses = useMemo(() => {
    if (!comparisonPosition) {
      return topCourses.map((course) => ({
        courseName: course.course_name,
        courseType: course.course_type,
        current: course,
        comparison: null,
      }));
    }

    const combined = new Map();
    allPositionCourses.forEach((course) => {
      combined.set(course.course_name, {
        courseName: course.course_name,
        courseType: course.course_type,
        current: course,
        comparison: null,
      });
    });
    comparisonCourses.forEach((course) => {
      const existing = combined.get(course.course_name);
      combined.set(course.course_name, {
        courseName: course.course_name,
        courseType: existing?.courseType || course.course_type,
        current: existing?.current || null,
        comparison: course,
      });
    });

    return [...combined.values()]
      .sort((left, right) => {
        const leftPopularity = Math.max(
          Number(left.current?.popularity_pct) || 0,
          Number(left.comparison?.popularity_pct) || 0,
        );
        const rightPopularity = Math.max(
          Number(right.current?.popularity_pct) || 0,
          Number(right.comparison?.popularity_pct) || 0,
        );
        const leftRecords = Math.max(
          Number(left.current?.total_taken) || 0,
          Number(left.comparison?.total_taken) || 0,
        );
        const rightRecords = Math.max(
          Number(right.current?.total_taken) || 0,
          Number(right.comparison?.total_taken) || 0,
        );
        return rightPopularity - leftPopularity
          || rightRecords - leftRecords
          || left.courseName.localeCompare(right.courseName, "ru");
      })
      .slice(0, 10);
  }, [allPositionCourses, comparisonCourses, comparisonPosition, topCourses]);

  const comparisonCompletionData = useMemo(() => comparisonSummary ? [
    { name: "Успешно завершено", value: comparisonSummary.passed, color: "var(--accent-2)" },
    {
      name: "Без успешного завершения",
      value: Math.max(0, comparisonSummary.records - comparisonSummary.passed),
      color: "var(--line)",
    },
  ].filter((item) => item.value > 0) : [], [comparisonSummary]);

  const updateComparisonPosition = (position) => {
    setComparisonPosition(position);
    setComparisonRevision((revision) => revision + 1);
  };

  const comparisonRenderKey = `${selectedPosition}::${comparisonPosition}::${comparisonRevision}`;

  return (
    <div className="analytics-container analytics-dashboard">
      <section className="analytics-header-card analytics-hero" aria-labelledby="analytics-title">
        <div className="analytics-header-title">
          <div className="analytics-title-icon" aria-hidden="true">
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="eyebrow">Реестр обучения</p>
            <h2 id="analytics-title">Аналитика по должностям</h2>
            <p className="muted analytics-source-summary">
              {isLoading
                ? "Загружаем подтверждённые данные реестра…"
                : `${formatNumber.format(totalRecords)} записей · ${formatNumber.format(datasetEmployeeCount)} сотрудников · ${formatNumber.format(positionsList.length)} должностей`}
            </p>
          </div>
        </div>

        <div className="position-select-box">
          <div className="analytics-filter-heading">
            <label className="form-label" htmlFor="analytics-position">Должность</label>
            <span>Срез данных</span>
          </div>
          <UnifiedDropdown
            id="analytics-position"
            value={selectedPosition}
            onChange={(position) => {
              setSelectedPosition(position);
              if (position === comparisonPosition) updateComparisonPosition("");
            }}
            ariaLabel="Должность"
            searchPlaceholder="Найти должность..."
            options={positionsList.map((position) => ({
              value: position,
              label: `${position} (${benchmarksData[position]?.total_employees || 0} ${employeeCountLabel(benchmarksData[position]?.total_employees || 0)})`,
            }))}
          />
        </div>
      </section>

      {isLoading ? (
        <div className="state-panel state-panel-compact analytics-loading" role="status">
          <span className="analytics-loading-mark" aria-hidden="true" />
          <div>
            <h3>Готовим аналитику</h3>
            <p className="muted">Собираем показатели по должностям и программам.</p>
          </div>
        </div>
      ) : loadError ? (
        <div className="state-panel state-panel-danger" role="alert">
          <span className="state-icon state-icon-danger"><XCircle size={28} /></span>
          <h3>Не удалось загрузить аналитику</h3>
          <p className="muted">{loadError}</p>
          <button className="primary-button state-action" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw size={16} /> Повторить
          </button>
        </div>
      ) : positionsList.length === 0 ? (
        <div className="state-panel state-panel-compact">
          <h3>Нет данных для анализа</h3>
          <p className="muted">В реестре пока нет подтверждённых агрегатов. После загрузки истории обучения показатели появятся здесь.</p>
        </div>
      ) : (
        <>
          <section className="analytics-context" aria-label="Выбранный срез">
            <div>
              <span>Выбранная должность</span>
              <strong>{selectedPosition}</strong>
            </div>
            <span className="analytics-live-badge"><span /> Данные реестра</span>
          </section>

          <section className="analytics-comparison" aria-labelledby="analytics-comparison-title">
            <div className="analytics-comparison-heading">
              <div>
                <p className="eyebrow">Сопоставление</p>
                <h3 id="analytics-comparison-title">Сравнить должности</h3>
                <p className="muted">Выберите вторую должность, чтобы сопоставить реальные показатели реестра.</p>
              </div>
              <div className="analytics-comparison-select">
                <label className="form-label" htmlFor="analytics-comparison-position">Вторая должность</label>
                <UnifiedDropdown
                  id="analytics-comparison-position"
                  value={comparisonPosition}
                  onChange={updateComparisonPosition}
                  ariaLabel="Вторая должность для сравнения"
                  placeholder="Выберите должность"
                  searchPlaceholder="Найти должность..."
                  options={positionsList
                    .filter((position) => position !== selectedPosition)
                    .map((position) => ({
                      value: position,
                      label: `${position} (${benchmarksData[position]?.total_employees || 0} ${employeeCountLabel(benchmarksData[position]?.total_employees || 0)})`,
                    }))}
                />
              </div>
            </div>

            {comparisonSummary && (
              <div
                key={comparisonRenderKey}
                className="analytics-comparison-result"
                aria-live="polite"
              >
                <div className="analytics-comparison-columns">
                  <span>Показатель</span>
                  <strong title={selectedPosition}>{selectedPosition}</strong>
                  <strong title={comparisonPosition}>{comparisonPosition}</strong>
                  <button type="button" onClick={() => updateComparisonPosition("")} aria-label="Закрыть сравнение" title="Закрыть сравнение">
                    <X size={16} />
                  </button>
                </div>
                {[
                  ["Сотрудников", formatNumber.format(currentSummary.employees), formatNumber.format(comparisonSummary.employees)],
                  ["Записей об обучении", formatNumber.format(currentSummary.records), formatNumber.format(comparisonSummary.records)],
                  ["Уникальных программ", formatNumber.format(currentSummary.programs), formatNumber.format(comparisonSummary.programs)],
                  ["Успешно завершено", formatPercent(currentSummary.completionRate), formatPercent(comparisonSummary.completionRate)],
                ].map(([label, currentValue, comparisonValue]) => (
                  <div className="analytics-comparison-row" key={label}>
                    <span>{label}</span>
                    <strong>{currentValue}</strong>
                    <strong>{comparisonValue}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="kpi-cards-grid analytics-kpis" aria-label="Ключевые показатели">
            <article className="kpi-card">
              <div className="kpi-icon-box"><Users size={20} /></div>
              <div>
                <div className="kpi-val">{formatNumber.format(currentPosData.total_employees)}</div>
                <div className="kpi-lbl">Сотрудников</div>
                <div className="kpi-note">в выбранной должности</div>
              </div>
            </article>

            <article className="kpi-card">
              <div className="kpi-icon-box"><BookOpen size={20} /></div>
              <div>
                <div className="kpi-val">{formatNumber.format(positionRecordCount)}</div>
                <div className="kpi-lbl">Записей об обучении</div>
                <div className="kpi-note">по всем программам</div>
              </div>
            </article>

            <article className="kpi-card">
              <div className="kpi-icon-box"><TrendingUp size={20} /></div>
              <div>
                <div className="kpi-val">{formatNumber.format(allPositionCourses.length)}</div>
                <div className="kpi-lbl">Уникальных программ</div>
                <div className="kpi-note">в истории обучения</div>
              </div>
            </article>

            <article className="kpi-card kpi-card-accent">
              <div className="kpi-icon-box"><CheckCircle2 size={20} /></div>
              <div>
                <div className="kpi-val">{formatPercent(completionRate)}</div>
                <div className="kpi-lbl">Успешно завершено</div>
                <div className="kpi-note">{formatNumber.format(passedRecordCount)} из {formatNumber.format(positionRecordCount)} записей</div>
              </div>
            </article>
          </section>

          <section className="charts-grid-layout analytics-primary-grid">
            <article className="chart-card-full analytics-ranking-card">
              <header className="analytics-card-heading">
                <div>
                  <p className="eyebrow">Рейтинг программ</p>
                  <h3>Востребованность обучения</h3>
                  <p className="muted">
                    {comparisonSummary
                      ? "Сравнение охвата программ для двух выбранных должностей."
                      : "Доля сотрудников выбранной должности, которые обучались по программе."}
                  </p>
                </div>
                <span className="analytics-count-badge">Топ-{chartCourses.length}</span>
              </header>

              {comparisonSummary && (
                <div className="analytics-chart-legend" aria-label="Легенда сравнения">
                  <span title={selectedPosition}><i className="is-current" />{selectedPosition}</span>
                  <span title={comparisonPosition}><i className="is-comparison" />{comparisonPosition}</span>
                </div>
              )}

              {chartCourses.length ? (
                <ol key={comparisonRenderKey} className={`analytics-ranking-list ${comparisonSummary ? "is-comparison" : ""}`}>
                  {chartCourses.map((chartCourse, index) => (
                    <li key={chartCourse.courseName} className="analytics-ranking-row">
                      <span className="analytics-rank">{index + 1}</span>
                      <div className="analytics-course-data">
                        <div className="analytics-course-line">
                          <strong title={chartCourse.courseName}>{chartCourse.courseName}</strong>
                          {comparisonSummary
                            ? <span className="analytics-type-tag">{chartCourse.courseType || "Тип не указан"}</span>
                            : <span>{formatPercent(chartCourse.current?.popularity_pct)}</span>}
                        </div>
                        {comparisonSummary ? (
                          <div className="analytics-dual-bars">
                            {[
                              ["Основная", chartCourse.current, "is-current"],
                              ["Сравнение", chartCourse.comparison, "is-comparison"],
                            ].map(([label, course, variant]) => (
                              <div className="analytics-dual-bar" key={label}>
                                <div>
                                  <span>{label} · {formatNumber.format(course?.total_taken || 0)} {recordCountLabel(Number(course?.total_taken) || 0)}</span>
                                  <strong>{formatPercent(course?.popularity_pct)}</strong>
                                </div>
                                <div className={`analytics-progress-track ${variant}`} aria-hidden="true">
                                  <span style={{ width: `${Math.min(100, Math.max(0, Number(course?.popularity_pct) || 0))}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="analytics-course-meta">
                              <span className="analytics-type-tag">{chartCourse.current?.course_type || "Тип не указан"}</span>
                              <span>{formatNumber.format(chartCourse.current?.total_taken || 0)} {recordCountLabel(Number(chartCourse.current?.total_taken) || 0)}</span>
                            </div>
                            <div className="analytics-progress-track" aria-hidden="true">
                              <span style={{ width: `${Math.min(100, Math.max(0, Number(chartCourse.current?.popularity_pct) || 0))}%` }} />
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">Для этой должности нет данных по программам.</p>
              )}
            </article>

            <article className="chart-card-side analytics-completion-card">
              <header className="analytics-card-heading">
                <div>
                  <p className="eyebrow">Результат обучения</p>
                  <h3>Успешность завершения</h3>
                  <p className="muted">
                    {comparisonSummary
                      ? "Два кольца показывают успешность каждой должности."
                      : "Соотношение успешных завершений ко всем записям."}
                  </p>
                </div>
              </header>

              {completionData.length ? (
                <>
                  <div className="analytics-donut" aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart key={comparisonRenderKey}>
                        <Pie
                          data={completionData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={comparisonSummary ? 78 : 72}
                          outerRadius={94}
                          startAngle={90}
                          endAngle={-270}
                          paddingAngle={2}
                          stroke="transparent"
                        >
                          {completionData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        {comparisonSummary && comparisonCompletionData.length > 0 && (
                          <Pie
                            data={comparisonCompletionData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={68}
                            startAngle={90}
                            endAngle={-270}
                            paddingAngle={2}
                            stroke="transparent"
                          >
                            {comparisonCompletionData.map((entry) => (
                              <Cell key={`comparison-${entry.name}`} fill={entry.color} />
                            ))}
                          </Pie>
                        )}
                        <Tooltip formatter={(value) => [formatNumber.format(value), "Записей"]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="analytics-donut-center">
                      <strong>{comparisonSummary ? "2" : formatPercent(completionRate)}</strong>
                      <span>{comparisonSummary ? "должности" : "успешно"}</span>
                    </div>
                  </div>

                  {comparisonSummary ? (
                    <ul key={comparisonRenderKey} className="analytics-status-list analytics-completion-comparison">
                      <li>
                        <span className="analytics-status-dot" style={{ backgroundColor: "var(--accent)" }} />
                        <span title={selectedPosition}>{selectedPosition}</span>
                        <strong>{formatPercent(currentSummary.completionRate)}</strong>
                      </li>
                      <li>
                        <span className="analytics-status-dot" style={{ backgroundColor: "var(--accent-2)" }} />
                        <span title={comparisonPosition}>{comparisonPosition}</span>
                        <strong>{formatPercent(comparisonSummary.completionRate)}</strong>
                      </li>
                    </ul>
                  ) : (
                    <ul className="analytics-status-list">
                      {completionData.map((item) => (
                        <li key={item.name}>
                          <span className="analytics-status-dot" style={{ backgroundColor: item.color }} />
                          <span>{item.name}</span>
                          <strong>{formatNumber.format(item.value)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!comparisonSummary && topCourses[0] && (
                    <div className="analytics-highlight">
                      <Award size={18} aria-hidden="true" />
                      <div>
                        <span>Лидер по охвату</span>
                        <strong>{topCourses[0].course_name}</strong>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">Недостаточно данных для расчёта успешности.</p>
              )}
            </article>
          </section>

          <section className="analytics-table-card" aria-labelledby="program-details-title">
            <header className="analytics-card-heading">
              <div>
                <p className="eyebrow">Детализация</p>
                <h3 id="program-details-title">Показатели по программам</h3>
                <p className="muted">Точные значения для десяти наиболее востребованных программ.</p>
              </div>
            </header>

            <div className="analytics-table-wrap">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th scope="col">№</th>
                    <th scope="col">Программа</th>
                    <th scope="col">Тип</th>
                    <th scope="col">Охват</th>
                    <th scope="col">Записей</th>
                    <th scope="col">Успешность</th>
                  </tr>
                </thead>
                <tbody>
                  {topCourses.map((course, index) => (
                    <tr key={course.course_name}>
                      <td>{index + 1}</td>
                      <th scope="row">{course.course_name}</th>
                      <td><span className="analytics-type-tag">{course.course_type || "—"}</span></td>
                      <td><strong>{formatPercent(course.popularity_pct)}</strong></td>
                      <td>{formatNumber.format(course.total_taken || 0)}</td>
                      <td>{course.success_rate == null ? "—" : formatPercent(course.success_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="analytics-mobile-programs" aria-label="Показатели программ">
              {topCourses.map((course, index) => (
                <article className="analytics-mobile-program" key={course.course_name}>
                  <header>
                    <span className="analytics-rank">{index + 1}</span>
                    <div>
                      <h4>{course.course_name}</h4>
                      <span className="analytics-type-tag">{course.course_type || "Тип не указан"}</span>
                    </div>
                  </header>
                  <dl>
                    <div><dt>Охват</dt><dd>{formatPercent(course.popularity_pct)}</dd></div>
                    <div><dt>Записей</dt><dd>{formatNumber.format(course.total_taken || 0)}</dd></div>
                    <div><dt>Успешность</dt><dd>{course.success_rate == null ? "—" : formatPercent(course.success_rate)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
