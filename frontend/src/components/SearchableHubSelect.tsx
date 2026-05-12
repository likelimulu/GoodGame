import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export interface SearchableHubOption {
  value: string;
  label: string;
  keywords?: string[];
}

interface SearchableHubSelectProps {
  id?: string;
  value: string;
  options: SearchableHubOption[];
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  minChars?: number;
  clearValue?: string;
  clearLabel?: string;
  promptLabel?: string;
  noResultsLabel?: string;
}

export default function SearchableHubSelect({
  id,
  value,
  options,
  onChange,
  name,
  disabled = false,
  required = false,
  placeholder = "Type to search forums",
  minChars = 3,
  clearValue,
  clearLabel = "Show All Hubs",
  promptLabel,
  noResultsLabel = "No matching forums found.",
}: SearchableHubSelectProps) {
  const fallbackId = useId();
  const inputId = id ?? `hub-search-${fallbackId}`;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const inputValue = isOpen ? query : (selectedOption?.label ?? "");
  const normalizedQuery = inputValue.trim().toLowerCase();
  const matches =
    normalizedQuery.length >= minChars
      ? options.filter((option) => {
          const haystack = [option.label, ...(option.keywords ?? [])].join(" ").toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : [];

  function handleSelect(option: SearchableHubOption) {
    onChange(option.value);
    setQuery(option.label);
    setIsOpen(false);
  }

  function handleClear() {
    if (!clearValue) return;
    onChange(clearValue);
    setQuery("");
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "Enter")) {
      setIsOpen(true);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setQuery(selectedOption?.label ?? "");
      return;
    }

    if (matches.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % matches.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + matches.length) % matches.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleSelect(matches[highlightedIndex] ?? matches[0]);
    }
  }

  return (
    <div className="search-combobox" ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="search-combobox-shell">
        <input
          ref={inputRef}
          id={inputId}
          className="search-combobox-input"
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            isOpen && matches[highlightedIndex]
              ? `${inputId}-option-${matches[highlightedIndex].value}`
              : undefined
          }
          aria-autocomplete="list"
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          onFocus={(event) => {
            setIsOpen(true);
            setQuery(selectedOption?.label ?? "");
            setHighlightedIndex(0);
            event.currentTarget.select();
          }}
          onClick={() => {
            if (!isOpen) {
              setIsOpen(true);
              setQuery(selectedOption?.label ?? "");
              setHighlightedIndex(0);
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightedIndex(0);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {clearValue && value !== clearValue ? (
          <button
            className="search-combobox-clear"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleClear}
          >
            {clearLabel}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div className="search-combobox-panel" role="presentation">
          {normalizedQuery.length < minChars ? (
            <p className="search-combobox-status">
              {promptLabel ?? "Type to search forums."}
            </p>
          ) : matches.length === 0 ? (
            <p className="search-combobox-status">{noResultsLabel}</p>
          ) : (
            <ul className="search-combobox-list" id={listboxId} role="listbox">
              {matches.map((option, index) => (
                <li key={option.value}>
                  <button
                    id={`${inputId}-option-${option.value}`}
                    className={`search-combobox-option ${index === highlightedIndex ? "is-active" : ""}`}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span>{option.label}</span>
                    {option.value === value ? (
                      <span className="search-combobox-option-meta">Current</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
