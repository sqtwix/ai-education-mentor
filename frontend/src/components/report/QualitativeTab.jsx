import { Quote, Search } from "lucide-react";
import { useState } from "react";

const formatPercent = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(0)}%` : "-";
};

const getPriorityClass = (priority) => {
  const normalizedPriority = String(priority).toLowerCase();
  if (normalizedPriority === "high" || normalizedPriority === "высокий") return "risk";
  if (normalizedPriority === "medium" || normalizedPriority === "средний") return "watch";
  return "normal";
};

function EvidenceLine({ children }) {
  return <p className="evidence-line">{children}</p>;
}

function EmptyQualitativeState({ title }) {
  return (
    <section className="panel analysis-empty-state">
      <h3>{title}</h3>
      <p className="muted">Backend не передал данные для этого блока качественного анализа.</p>
    </section>
  );
}

export function QualitativeTab({ textAnalysis, activeTab, onTabChange, sourceLimitation }) {
  const [searchQuery, setSearchQuery] = useState("");

  const tabs = [
    { key: "topics", label: "Темы отзывов" },
    { key: "sentiment", label: "Тональность" },
    { key: "problems", label: "Критичные проблемы" },
    { key: "quotes", label: "Цитаты слушателей" },
    { key: "recommendations", label: "Рекомендации" },
  ];

  if (!textAnalysis) {
    return <EmptyQualitativeState title="Качественный анализ отзывов" />;
  }

  const query = searchQuery.trim().toLowerCase();

  const filteredTopics = (textAnalysis.top_topics || []).filter(
    (t) => !query || t.topic?.toLowerCase().includes(query) || t.description?.toLowerCase().includes(query)
  );

  const filteredProblems = (textAnalysis.key_problems || []).filter(
    (p) => !query || p.problem?.toLowerCase().includes(query) || p.severity?.toLowerCase().includes(query)
  );

  const filteredQuotes = (textAnalysis.quotes || []).filter(
    (q) => !query || q.quote?.toLowerCase().includes(query)
  );

  const filteredRecommendations = (textAnalysis.recommendations || []).filter(
    (r) => !query || r.target?.toLowerCase().includes(query) || r.action_item?.toLowerCase().includes(query)
  );

  return (
    <div className="qualitative-layout">
      <aside className="qualitative-subnav" aria-label="Разделы качественного анализа">
        <div className="search-filter-box" style={{ padding: "10px", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--surface, #ffffff)", border: "1px solid var(--line, #cbd5e1)", borderRadius: "6px", padding: "6px 10px" }}>
            <Search size={14} className="muted" />
            <input
              type="text"
              placeholder="Поиск по отзывам..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: "none", outline: "none", width: "100%", fontSize: "12px", background: "transparent", color: "var(--text)" }}
            />
          </div>
        </div>

        {tabs.map((subTab) => (
          <button
            key={subTab.key}
            type="button"
            className={`subtab-btn ${activeTab === subTab.key ? "active" : ""}`}
            onClick={() => onTabChange(subTab.key)}
            title={subTab.label}
          >
            <span className="subtab-label">{subTab.label}</span>
          </button>
        ))}
      </aside>

      <div className="qualitative-content">
        {activeTab === "topics" && (
          filteredTopics.length ? (
            <div className="qualitative-list">
              {filteredTopics.map((topic, index) => (
                <article key={`${topic.topic}-${index}`} className="panel qualitative-card">
                  <div>
                    <h4>{topic.topic}</h4>
                    <p className="muted">{topic.description}</p>
                    <EvidenceLine>Основание: агрегированная тема, частота упоминаний - {topic.frequency}.</EvidenceLine>
                  </div>
                  <span className="badge evidence-badge">Упоминаний: {topic.frequency}</span>
                </article>
              ))}
            </div>
          ) : (
            <EmptyQualitativeState title="Темы отзывов" />
          )
        )}

        {activeTab === "sentiment" && (
          textAnalysis.sentiment ? (
            <section className="panel sentiment-panel">
              <h3>Эмоциональная тональность отзывов</h3>
              <div className="sentiment-grid">
                {[
                  { label: "Позитивные", value: textAnalysis.sentiment.positive, tone: "positive" },
                  { label: "Нейтральные", value: textAnalysis.sentiment.neutral, tone: "neutral" },
                  { label: "Негативные", value: textAnalysis.sentiment.negative, tone: "negative" },
                ].map((sentiment) => (
                  <div key={sentiment.label} className={`sentiment-card ${sentiment.tone}`}>
                    <strong>{formatPercent(sentiment.value)}</strong>
                    <span>{sentiment.label}</span>
                  </div>
                ))}
              </div>
              <EvidenceLine>Основание: агрегированная классификация всех комментариев, переданная backend.</EvidenceLine>
            </section>
          ) : (
            <EmptyQualitativeState title="Тональность" />
          )
        )}

        {activeTab === "problems" && (
          filteredProblems.length ? (
            <div className="qualitative-list">
              {filteredProblems.map((problem, index) => (
                <article key={`${problem.problem}-${index}`} className="panel qualitative-card problem-card">
                  <span className={`risk-pill ${getPriorityClass(problem.severity)}`}>{problem.severity}</span>
                  <div>
                    <h4>{problem.problem}</h4>
                    <EvidenceLine>
                      Основание: встречается в {formatPercent(problem.frequency_percent)} отзывов; уровень риска - {problem.severity}.
                    </EvidenceLine>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyQualitativeState title="Критичные проблемы" />
          )
        )}

        {activeTab === "quotes" && (
          filteredQuotes.length ? (
            <div className="qualitative-list">
              {filteredQuotes.map((quote, index) => (
                <article key={`${quote.quote}-${index}`} className="panel quote-card qualitative-quote-card">
                  <Quote size={20} className="muted" />
                  <p>«{quote.quote}»</p>
                  <EvidenceLine>Основание: частота схожих формулировок - {quote.frequency}; {sourceLimitation}</EvidenceLine>
                </article>
              ))}
            </div>
          ) : (
            <EmptyQualitativeState title="Цитаты слушателей" />
          )
        )}

        {activeTab === "recommendations" && (
          filteredRecommendations.length ? (
            <div className="qualitative-list">
              {filteredRecommendations.map((recommendation, index) => (
                <article key={`${recommendation.target}-${index}`} className="panel qualitative-card recommendation-card">
                  <div>
                    <span className="badge recommendation-target">Объект: {recommendation.target}</span>
                    <h4>{recommendation.action_item}</h4>
                    <EvidenceLine>
                      Основание: рекомендация сформирована из агрегированных проблем и тем; точные ссылки на строки недоступны до расширения backend-контракта.
                    </EvidenceLine>
                  </div>
                  <span className={`risk-pill ${getPriorityClass(recommendation.priority)}`}>
                    Приоритет: {recommendation.priority}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <EmptyQualitativeState title="Рекомендации" />
          )
        )}
      </div>
    </div>
  );
}
