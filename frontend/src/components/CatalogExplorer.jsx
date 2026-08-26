import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, BookOpen, Clock, RefreshCw, X, XCircle } from "lucide-react";
import { getCoursesCatalog, isAuthExpiredError } from "../api";
import { UnifiedDropdown } from "./UnifiedDropdown";

export function CatalogExplorer({ notify }) {
  const [catalog, setCatalog] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all"); // "all", "ППК", "ЭК"
  const [selectedComp, setSelectedComp] = useState("all");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const modalRef = useRef(null);
  const modalCloseRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    async function loadCatalog() {
      try {
        setIsLoading(true);
        setLoadError("");
        const data = await getCoursesCatalog();
        setCatalog(data || []);
        if (reloadKey > 0) {
          notify?.({ type: "success", title: "Каталог обновлён" });
        }
      } catch (err) {
        if (isAuthExpiredError(err)) return;
        console.error("Failed to load catalog:", err);
        const message = err.message || "Не удалось получить каталог программ.";
        setLoadError(message);
        notify?.({
          type: "error",
          title: "Каталог не загрузился",
          message,
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadCatalog();
  }, [notify, reloadKey]);

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
      const focusableElements = Array.from(
        modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    modalCloseRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [selectedCourse]);

  const allCompetencies = useMemo(() => {
    const set = new Set();
    catalog.forEach((c) => {
      (c.competencies || []).forEach((comp) => set.add(comp));
    });
    return Array.from(set);
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru");
    return catalog.filter((course) => {
      const searchableText = [
        course.name,
        course.annotation,
        course.type,
        course.target,
        course.results,
        ...(course.competencies || []),
      ].filter(Boolean).join(" ").toLocaleLowerCase("ru");
      const matchesSearch = !normalizedQuery || searchableText.includes(normalizedQuery);

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
      <div className="catalog-header-card">
        <div className="catalog-title-row">
          <div>
            <p className="eyebrow">Каталог 2025</p>
            <h2>Образовательные программы</h2>
            <p className="muted">
              Найдите программу по названию, описанию, формату или компетенции.
            </p>
          </div>
          <div className="catalog-summary" aria-live="polite">
            <strong>{filteredCatalog.length}</strong>
            <span>из {catalog.length}</span>
          </div>
        </div>

        <div className="catalog-controls-grid">
          <div className="search-input-wrapper">
            <label className="sr-only" htmlFor="catalog-search">Поиск по каталогу</label>
            <Search size={18} className="search-icon" />
            <input
              id="catalog-search"
              type="text"
              className="search-input"
              placeholder="Название, описание, формат или компетенция"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="clear-search-btn" onClick={() => setSearchQuery("")} aria-label="Очистить поиск">
                <X size={16} />
              </button>
            )}
          </div>

          <div className="filter-group">
            <div className="filter-control">
              <label className="sr-only" htmlFor="catalog-type">Формат программы</label>
              <UnifiedDropdown
                id="catalog-type"
                value={selectedType}
                onChange={setSelectedType}
                ariaLabel="Формат программы"
                options={[
                  { value: "all", label: "Все форматы (ППК и ЭК)" },
                  { value: "ППК", label: "Программы повышения квалификации (ППК)" },
                  { value: "ЭК", label: "Электронные курсы (ЭК)" },
                ]}
              />
            </div>

            <div className="filter-control">
              <label className="sr-only" htmlFor="catalog-competency">Компетенция</label>
              <UnifiedDropdown
                id="catalog-competency"
                value={selectedComp}
                onChange={setSelectedComp}
                ariaLabel="Компетенция"
                options={[
                  { value: "all", label: "Все компетенции" },
                  ...allCompetencies.map((comp) => ({ value: comp, label: comp })),
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Список курсов */}
      {isLoading ? (
        <div className="loading-box">
          <p>Загрузка каталога образовательных программ...</p>
        </div>
      ) : loadError ? (
        <div className="state-panel state-panel-danger" role="alert">
          <span className="state-icon state-icon-danger"><XCircle size={28} /></span>
          <h3>Не удалось загрузить каталог</h3>
          <p className="muted">{loadError}</p>
          <button className="primary-button state-action" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw size={16} /> Повторить
          </button>
        </div>
      ) : filteredCatalog.length === 0 ? (
        <div className="empty-state">
          <BookOpen size={40} className="text-muted" />
          <h3>{catalog.length ? "Курсы не найдены" : "Каталог пока пуст"}</h3>
          <p className="muted">
            {catalog.length
              ? "Измените запрос или сбросьте фильтры, чтобы увидеть другие программы."
              : "Когда программы появятся в официальном каталоге, они будут доступны здесь."}
          </p>
          {catalog.length > 0 && (
            <button
              className="secondary-button state-action"
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedType("all");
                setSelectedComp("all");
              }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="catalog-cards-grid">
          {filteredCatalog.map((course) => {
            const isEK = course.type === "ЭК";
            return (
              <button
                type="button"
                key={course.id}
                className="catalog-course-card"
                onClick={(event) => {
                  previouslyFocusedRef.current = event.currentTarget;
                  setSelectedCourse(course);
                }}
                aria-label={`Открыть программу: ${course.name}`}
              >
                <div className="card-course-meta">
                  <span className={`type-tag ${isEK ? "type-ek" : "type-ppk"}`}>
                    {course.type || "Не указан"}
                  </span>
                  <span className="hours-tag">
                    <Clock size={12} /> {course.duration_hours ? `${course.duration_hours} ак. ч.` : "не указано"}
                  </span>
                </div>

                <span className="card-course-title" role="heading" aria-level="3">{course.name}</span>

                {course.annotation && (
                  <p className="card-course-annotation">
                    {course.annotation.length > 160 ? `${course.annotation.slice(0, 160)}…` : course.annotation}
                  </p>
                )}

                {course.competencies && course.competencies.length > 0 && (
                  <p className="card-course-competencies">{course.competencies.join(" · ")}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Модальное окно деталей курса */}
      {selectedCourse && (
        <div className="modal-backdrop" onClick={() => setSelectedCourse(null)}>
          <div ref={modalRef} className="course-modal-content" role="dialog" aria-modal="true" aria-labelledby="catalog-course-title" onClick={(e) => e.stopPropagation()}>
            <button ref={modalCloseRef} type="button" className="modal-close-btn" onClick={() => setSelectedCourse(null)} aria-label="Закрыть карточку программы">
              <X size={20} />
            </button>

            <div className="modal-type-header">
              <span className={`type-tag ${selectedCourse.type === "ЭК" ? "type-ek" : selectedCourse.type === "ППК" ? "type-ppk" : ""}`}>
                {selectedCourse.type === "ЭК"
                  ? "Электронный курс (ЭК)"
                  : selectedCourse.type === "ППК"
                    ? "Программа повышения квалификации (ППК)"
                    : "Тип программы не указан"}
              </span>
              <span className="hours-tag">
                <Clock size={13} /> {selectedCourse.duration_hours ? `${selectedCourse.duration_hours} ак. ч.` : "не указано"}
              </span>
            </div>

            <h2 className="modal-course-title" id="catalog-course-title">{selectedCourse.name}</h2>

            {selectedCourse.annotation && (
              <div className="modal-section">
                <h3>Аннотация программы:</h3>
                <p className="modal-text">{selectedCourse.annotation}</p>
              </div>
            )}

            {selectedCourse.target && (
              <div className="modal-section">
                <h3>Цель программы:</h3>
                <p className="modal-text">{selectedCourse.target}</p>
              </div>
            )}

            {selectedCourse.results && (
              <div className="modal-section">
                <h3>Результаты освоения (знать, уметь, владеть):</h3>
                <div className="modal-text results-box">{selectedCourse.results}</div>
              </div>
            )}

            {selectedCourse.competencies && selectedCourse.competencies.length > 0 && (
              <div className="modal-section">
                <h3>Формируемые компетенции:</h3>
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
