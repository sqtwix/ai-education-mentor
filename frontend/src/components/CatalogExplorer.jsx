import React, { useState, useEffect, useMemo } from "react";
import { Search, Filter, BookOpen, Clock, Tag, Award, X, CheckCircle, Sparkles } from "lucide-react";
import { getCoursesCatalog } from "../api";

export function CatalogExplorer() {
  const [catalog, setCatalog] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all"); // "all", "ППК", "ЭК"
  const [selectedComp, setSelectedComp] = useState("all");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadCatalog() {
      try {
        setIsLoading(true);
        const data = await getCoursesCatalog();
        setCatalog(data || []);
      } catch (err) {
        console.error("Failed to load catalog:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadCatalog();
  }, []);

  const allCompetencies = useMemo(() => {
    const set = new Set();
    catalog.forEach((c) => {
      (c.competencies || []).forEach((comp) => set.add(comp));
    });
    return Array.from(set);
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter((course) => {
      const matchesSearch =
        !searchQuery ||
        course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (course.annotation && course.annotation.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesType =
        selectedType === "all" || course.type === selectedType;

      const matchesComp =
        selectedComp === "all" ||
        (course.competencies && course.competencies.includes(selectedComp));

      return matchesSearch && matchesType && matchesComp;
    });
  }, [catalog, searchQuery, selectedType, selectedComp]);

  return (
    <div className="catalog-explorer-container">
      {/* Header */}
      <div className="catalog-header-card">
        <div className="catalog-title-row">
          <div>
            <h3>Каталог образовательных программ 2025 года</h3>
            <p className="muted">
              Официальная линейка программ Корпоративного университета Санкт-Петербурга: ППК и Электронные курсы
            </p>
          </div>
          <div className="catalog-summary-pill">
            <span>Всего программ: <strong>{catalog.length}</strong></span>
          </div>
        </div>

        {/* Фильтры и поиск */}
        <div className="catalog-controls-grid">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Поиск по названию или описанию курса..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery("")}>
                <X size={16} />
              </button>
            )}
          </div>

          <div className="filter-group">
            <select
              className="filter-select"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="all">Все форматы (ППК и ЭК)</option>
              <option value="ППК">Программы повышения квалификации (ППК)</option>
              <option value="ЭК">Электронные курсы (ЭК)</option>
            </select>

            <select
              className="filter-select"
              value={selectedComp}
              onChange={(e) => setSelectedComp(e.target.value)}
            >
              <option value="all">Все компетенции</option>
              {allCompetencies.map((comp, idx) => (
                <option key={idx} value={comp}>
                  {comp}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Список курсов */}
      {isLoading ? (
        <div className="loading-box">
          <p>Загрузка каталога образовательных программ...</p>
        </div>
      ) : filteredCatalog.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={40} className="text-muted" />
          <h4>Курсы не найдены</h4>
          <p className="muted">Попробуйте изменить параметры поиска или фильтрации.</p>
        </div>
      ) : (
        <div className="catalog-cards-grid">
          {filteredCatalog.map((course) => {
            const isEK = course.type === "ЭК";
            return (
              <div
                key={course.id}
                className="catalog-course-card"
                onClick={() => setSelectedCourse(course)}
              >
                <div className="card-top-badges">
                  <span className={`type-tag ${isEK ? "type-ek" : "type-ppk"}`}>
                    {course.type || "ППК"}
                  </span>
                  <span className="hours-tag">
                    <Clock size={12} /> {course.duration_hours || 16} ак. ч.
                  </span>
                </div>

                <h4 className="card-course-title">{course.name}</h4>

                {course.annotation && (
                  <p className="card-course-annotation">
                    {course.annotation.slice(0, 160)}...
                  </p>
                )}

                {course.competencies && course.competencies.length > 0 && (
                  <div className="card-comp-chips">
                    {course.competencies.map((comp, idx) => (
                      <span key={idx} className="comp-chip">
                        {comp}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Модальное окно деталей курса */}
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
              <span className="hours-tag">
                <Clock size={13} /> {selectedCourse.duration_hours || 16} ак. ч.
              </span>
            </div>

            <h2 className="modal-course-title">{selectedCourse.name}</h2>

            {selectedCourse.annotation && (
              <div className="modal-section">
                <h5>Аннотация программы:</h5>
                <p className="modal-text">{selectedCourse.annotation}</p>
              </div>
            )}

            {selectedCourse.target && (
              <div className="modal-section">
                <h5>Цель программы:</h5>
                <p className="modal-text">{selectedCourse.target}</p>
              </div>
            )}

            {selectedCourse.results && (
              <div className="modal-section">
                <h5>Результаты освоения (знать, уметь, владеть):</h5>
                <div className="modal-text results-box">{selectedCourse.results}</div>
              </div>
            )}

            {selectedCourse.competencies && selectedCourse.competencies.length > 0 && (
              <div className="modal-section">
                <h5>Формируемые компетенции:</h5>
                <div className="modal-comp-tags">
                  {selectedCourse.competencies.map((comp, idx) => (
                    <span key={idx} className="comp-tag-pill">{comp}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
