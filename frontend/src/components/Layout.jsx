import { useEffect } from "react";
import {
  Archive, FileText, LogOutIcon, Menu, PanelLeftClose, PanelLeftOpen, 
  Plus, Search, Settings, User, BookOpen, BarChart3
} from "lucide-react";

const RECENT_REPORT_LIMIT = 5;

function HistoryReportRow({ report, route, onArchiveReport }) {
  const isActive = route === `report-detail-${report.id}`;

  return (
    <div className={`history-row ${isActive ? "active" : ""}`}>
      <a
        href={`#report-detail-${report.id}`}
        className="history-item"
        aria-current={isActive ? "page" : undefined}
        title={report.title ? `${report.course}: ${report.title}` : report.course}
        onClick={(event) => {
          event.preventDefault();
          window.location.hash = `report-detail-${report.id}`;
        }}
      >
        <FileText size={16} strokeWidth={2.2} />
        <span>{report.course}</span>
      </a>
      <button
        type="button"
        className="history-archive-button"
        aria-label={`Архивировать отчет ${report.course}`}
        title="Архивировать"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onArchiveReport?.(report.id);
        }}
      >
        <Archive size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}

export function AppLayout({
  route,
  pageTitle,
  children,
  reports,
  historyQuery,
  onHistoryQueryChange,
  onArchiveReport,
  onNewAnalysis,
  token,
  user,
  userEmail,
  isMenuOpen,
  setIsMenuOpen,
  isProfileMenuOpen,
  setIsProfileMenuOpen,
  setIsSaveMenuOpen,
  profileActionsRef,
  onLogout,
  settings,
  sidebarWidth,
  isSidebarCollapsed,
  onSidebarToggle,
  onSidebarResizeStart,
  historyLoadError,
  onRetryHistory,
}) {
  const isHistorySearchActive = Boolean(historyQuery.trim());
  const recentReports = isHistorySearchActive ? reports : reports.slice(0, RECENT_REPORT_LIMIT);
  const olderReports = isHistorySearchActive ? [] : reports.slice(RECENT_REPORT_LIMIT);

  useEffect(() => {
    if (!isMenuOpen && !isProfileMenuOpen) return undefined;

    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (isProfileMenuOpen) {
        setIsProfileMenuOpen(false);
        profileActionsRef.current?.querySelector(".profile-trigger")?.focus();
      }
      if (isMenuOpen) setIsMenuOpen(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isMenuOpen, isProfileMenuOpen, profileActionsRef, setIsMenuOpen, setIsProfileMenuOpen]);

  return (
    <div
      className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` }}
      data-accessibility={settings?.accessibility?.enabled ? "enabled" : "default"}
      data-density={settings?.minimalUi ? "minimal" : "comfortable"}
    >
      {isMenuOpen && (
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
      <aside className="sidebar" id="main-sidebar" aria-label="Основная навигация">
        <a className="brand" href="#constructor" aria-label="ИИ-агент индивидуальной траектории обучения">
          <img className="brand-logo" src="/logo.png" alt="ИИ-агент ИОТ" width="42" height="42" />
          <span>
            <strong>ИИ-агент ИОТ</strong>
            <small>Корпоративный университет СПб</small>
          </span>
        </a>

        <a href="#constructor" className={`new-chat-btn ${route === "constructor" || route === "upload" ? "active" : ""}`} aria-current={route === "constructor" || route === "upload" ? "page" : undefined} onClick={onNewAnalysis}>
          <Plus size={18} strokeWidth={2.2} /> Сформировать ИОТ
        </a>

        <nav className="nav sidebar-nav-top">
          <a href="#catalog" className={`secondary-nav-link ${route === "catalog" ? "active" : ""}`} aria-current={route === "catalog" ? "page" : undefined}>
            <BookOpen size={17} strokeWidth={2.2} /> Каталог программ
          </a>
          <a href="#analytics" className={`secondary-nav-link ${route === "analytics" ? "active" : ""}`} aria-current={route === "analytics" || route === "benchmarks" ? "page" : undefined}>
            <BarChart3 size={17} strokeWidth={2.2} /> Аналитика обучения
          </a>
        </nav>

        <div className="sidebar-divider"></div>

        <div className="sidebar-history-section">
          <div className="sidebar-section-title">Последние траектории</div>
          <label className="sidebar-search">
            <Search size={16} strokeWidth={2.2} />
            <input
              type="search"
              value={historyQuery}
              onChange={(e) => onHistoryQueryChange(e.target.value)}
              placeholder="Найти траекторию"
              aria-label="Найти траекторию в истории"
            />
          </label>

          <div className="sidebar-history" id="reports-sidebar-list">
            {historyLoadError && reports.length > 0 && (
              <div className="sidebar-empty sidebar-error" role="alert">
                <strong>Не удалось обновить историю</strong>
                <button type="button" className="sidebar-retry-button" onClick={onRetryHistory}>Повторить</button>
              </div>
            )}
            {historyLoadError && !reports.length ? (
              <div className="sidebar-empty sidebar-error" role="alert">
                <strong>История недоступна</strong>
                <span>{historyLoadError}</span>
                <button type="button" className="sidebar-retry-button" onClick={onRetryHistory}>
                  Повторить
                </button>
              </div>
            ) : reports.length ? (
              <>
                {recentReports.map((report) => (
                  <HistoryReportRow
                    key={report.id}
                    report={report}
                    route={route}
                    onArchiveReport={onArchiveReport}
                  />
                ))}
                {olderReports.length > 0 && (
                  <details className="sidebar-history-more">
                    <summary>Ещё {olderReports.length}</summary>
                    <div className="sidebar-history-more-list">
                      {olderReports.map((report) => (
                        <HistoryReportRow
                          key={report.id}
                          report={report}
                          route={route}
                          onArchiveReport={onArchiveReport}
                        />
                      ))}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <div className="sidebar-empty">
                <strong>{historyQuery ? "Ничего не найдено" : "История пока пуста"}</strong>
                <span>
                  {historyQuery
                    ? "Измените запрос или очистите строку поиска."
                    : "Сформируйте первую ИОТ — она появится здесь автоматически."}
                </span>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="sidebar-resize-handle"
          aria-label="Изменить ширину панели"
          onPointerDown={onSidebarResizeStart}
        ></button>
      </aside>

      <main className="workspace" aria-labelledby="page-title">
        <h1 id="page-title" className="sr-only">{pageTitle}</h1>
        <header className="topbar">
          <button
            className="menu-button"
            type="button"
            aria-label={isMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={isMenuOpen}
            aria-controls="main-sidebar"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu size={20} strokeWidth={2.2} />
          </button>
          <button
            className="icon-action-button sidebar-toggle-button"
            type="button"
            aria-label={isSidebarCollapsed ? "Показать левую панель" : "Скрыть левую панель"}
            title={isSidebarCollapsed ? "Показать левую панель" : "Скрыть левую панель"}
            onClick={onSidebarToggle}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen size={18} strokeWidth={2.2} />
            ) : (
              <PanelLeftClose size={18} strokeWidth={2.2} />
            )}
          </button>
          <div className="top-actions">
            {token ? (
              <div className="profile-actions" ref={profileActionsRef}>
                <button
                  type="button"
                  className="icon-action-button profile-trigger"
                  onClick={() => {
                    setIsSaveMenuOpen(false);
                    setIsProfileMenuOpen((isOpen) => !isOpen);
                  }}
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label={user ? `Профиль: ${user}` : "Профиль"}
                  title={user ? `Профиль: ${user}` : "Профиль"}
                >
                  <User size={18} strokeWidth={2.2} />
                </button>
                {isProfileMenuOpen && (
                  <div className="profile-menu" role="menu">
                    <div className="profile-summary">
                      <span className="profile-summary-icon">
                        <User size={18} strokeWidth={2.2} />
                      </span>
                      <span className="profile-summary-text">
                        <strong>{user || "Пользователь"}</strong>
                        {userEmail && <small>{userEmail}</small>}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="profile-menu-link"
                      role="menuitem"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        window.location.hash = "settings";
                      }}
                    >
                      <Settings size={16} strokeWidth={2.2} />
                      Настройки
                    </button>
                    <button
                      type="button"
                      className="profile-menu-danger"
                      role="menuitem"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        onLogout();
                      }}
                    >
                      <LogOutIcon size={16} strokeWidth={2.2} />
                      Выйти
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <a className="ghost-button" href="#login">Войти</a>
                <a className="primary-button" href="#register">Регистрация</a>
              </>
            )}
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
