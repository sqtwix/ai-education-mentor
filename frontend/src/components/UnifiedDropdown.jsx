import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

const normalizeOptions = (options) => options.map((option) => (
  typeof option === "string"
    ? { value: option, label: option }
    : { value: String(option.value), label: String(option.label ?? option.value) }
));

export function UnifiedDropdown({
  id,
  value,
  onChange,
  options,
  placeholder = "Выберите значение",
  searchPlaceholder = "Поиск по списку...",
  ariaLabel,
  editable = false,
  required = false,
  className = "",
}) {
  const generatedId = useId();
  const controlId = id || `dropdown-${generatedId}`;
  const listboxId = `${controlId}-listbox`;
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState("bottom");

  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const filteredOptions = useMemo(() => {
    if (!query.trim()) return normalizedOptions;
    const normalizedQuery = query.trim().toLocaleLowerCase("ru");
    return normalizedOptions.filter((option) =>
      option.label.toLocaleLowerCase("ru").includes(normalizedQuery)
    );
  }, [normalizedOptions, query]);

  const selectedOption = normalizedOptions.find((option) => option.value === String(value ?? ""));
  const displayValue = editable
    ? String(value ?? "")
    : isOpen
      ? query
      : selectedOption?.label || "";

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const roomBelow = window.innerHeight - rect.bottom;
      setPlacement(roomBelow < 280 && rect.top > roomBelow ? "top" : "bottom");
    }
    const selectedIndex = filteredOptions.findIndex((option) => option.value === String(value ?? ""));
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredOptions, isOpen, value]);

  const openDropdown = () => {
    if (!isOpen) setQuery("");
    setIsOpen(true);
  };

  const chooseOption = (option) => {
    onChange(option.value);
    setQuery("");
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Tab") {
      setIsOpen(false);
      setQuery("");
      return;
    }
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openDropdown();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const count = filteredOptions.length;
        return count ? (current + direction + count) % count : 0;
      });
      return;
    }
    if (event.key === "Enter" && isOpen && filteredOptions[activeIndex]) {
      event.preventDefault();
      chooseOption(filteredOptions[activeIndex]);
    }
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!rootRef.current?.contains(document.activeElement)) {
        setIsOpen(false);
        setQuery("");
      }
    }, 0);
  };

  return (
    <div
      ref={rootRef}
      className={`unified-dropdown ${isOpen ? "is-open" : ""} placement-${placement} ${className}`.trim()}
    >
      <input
        id={controlId}
        type="text"
        className="unified-dropdown-control"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && filteredOptions[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        autoComplete="off"
        spellCheck="false"
        value={displayValue}
        placeholder={isOpen && !editable ? searchPlaceholder : placeholder}
        required={required}
        onFocus={openDropdown}
        onClick={openDropdown}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (editable) onChange(nextValue);
          setQuery(nextValue);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />

      <ChevronDown className="unified-dropdown-chevron" size={18} aria-hidden="true" />

      {isOpen && (
        <div id={listboxId} className="unified-dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {filteredOptions.length ? filteredOptions.map((option, index) => {
            const isSelected = option.value === String(value ?? "");
            return (
              <button
                id={`${listboxId}-${index}`}
                key={`${option.value}-${index}`}
                type="button"
                className={`unified-dropdown-option ${index === activeIndex ? "is-active" : ""} ${isSelected ? "is-selected" : ""}`}
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={16} aria-hidden="true" />}
              </button>
            );
          }) : (
            <div className="unified-dropdown-empty">Совпадений не найдено</div>
          )}
        </div>
      )}
    </div>
  );
}
