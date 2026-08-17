function ReportSection({ title, children, defaultOpen = false }) {
  return (
    <details className="document-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="document-section-body">{children}</div>
    </details>
  );
}

export function AnalyticalReportTab({ reportData }) {
  if (!reportData) {
    return (
      <section className="panel analysis-empty-state">
        <h3>Аналитическая справка</h3>
        <p className="muted">Backend не передал аналитическую справку для этого отчета.</p>
      </section>
    );
  }

  const keyCriteria = reportData.section2_key_criteria || {};
  const suggestions = reportData.section3_suggestions || {};
  const trajectory = reportData.section4_trajectory || {};

  return (
    <section className="panel document-panel">
      <div className="document-sheet">
        <h3>Аналитическая записка по итогам анкетирования</h3>

        <ReportSection title="Раздел 1. Общая информация" defaultOpen>
          <p>{reportData.section1_general_info}</p>
        </ReportSection>

        <ReportSection title="Раздел 2. Анализ ключевых критериев программы">
          <ul>
            <li><b>Полезность курса:</b> {keyCriteria.usefulness_summary}</li>
            <li><b>Практическая применимость:</b> {keyCriteria.practicality_summary}</li>
            <li><b>Доступность материала:</b> {keyCriteria.accessibility_summary}</li>
            <li><b>Взаимодействие с организаторами КУ:</b> {keyCriteria.interaction_summary}</li>
            <li><b>Психологическая вовлеченность:</b> {keyCriteria.involvement_summary}</li>
          </ul>
        </ReportSection>

        <ReportSection title="Раздел 3. Предложения слушателей по изменению программы">
          <div className="document-prose-group">
            {suggestions.unwanted_topics?.length > 0 && (
              <p><b>Темы к исключению:</b> {suggestions.unwanted_topics.join(", ")}</p>
            )}
            {suggestions.added_topics?.length > 0 && (
              <p>
                <b>Темы к добавлению:</b>{" "}
                {suggestions.added_topics.map((topic) => `${topic.topic} (${topic.count} запросов)`).join("; ")}
              </p>
            )}
            <p><b>Сводка по формату обучения:</b> {suggestions.preferred_format_summary}</p>
          </div>
        </ReportSection>

        <ReportSection title="Раздел 4. Рекомендации по корректировке траектории программы">
          <div className="document-prose-group">
            <p><b>Востребованность курса:</b> {trajectory.further_implementation_needed}</p>
            <p><b>Рекомендации по отбору:</b> {trajectory.student_selection_correction}</p>
            <p><b>Изменения по темам:</b> {trajectory.added_topics_recommendation}</p>
            <p><b>Распределение часов:</b> {trajectory.hours_correction_needed}</p>
            <p><b>Рекомендованный формат занятий:</b> {trajectory.format_correction_needed}</p>

            {trajectory.conclusions?.length > 0 && (
              <div className="document-conclusions">
                <b>Выводы и заключения:</b>
                <ul>
                  {trajectory.conclusions.map((conclusion, index) => (
                    <li key={`${conclusion}-${index}`}>{conclusion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ReportSection>
      </div>
    </section>
  );
}
