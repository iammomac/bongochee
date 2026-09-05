import { Children, isValidElement, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useDropdownPosition } from "../hooks/useDropdownPosition";

// Native <select> can't have its open dropdown list restyled with CSS at all —
// that popup is rendered by the OS/browser, not the page — so matching the
// app's look requires a fully custom-rendered listbox instead of wrapping a
// native <select>. <option> children are still accepted (and parsed for their
// value/label) purely so call sites read the same as a native select.
interface OptionData {
  value: string;
  label: ReactNode;
}

function extractOptions(children: ReactNode): OptionData[] {
  const options: OptionData[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement<{ value?: string; children?: ReactNode }>(child)) {
      options.push({ value: String(child.props.value ?? ""), label: child.props.children });
    }
  });
  return options;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  name?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({ value, onChange, children, name, disabled, className = "" }: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const options = extractOptions(children);
  const selected = options.find((o) => o.value === value);
  // Stable identity — useDropdownPosition depends on this, and a fresh function
  // every render would re-trigger its effect (which calls setStyle) every render,
  // which triggers this component to re-render, which creates a fresh close()
  // again: an infinite loop.
  const close = useCallback(() => setOpen(false), []);
  const panelStyle = useDropdownPosition(triggerRef, open, close);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleSelect = (optionValue: string) => {
    setOpen(false);
    onChange(optionValue);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        name={name}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white py-2.5 pl-4 pr-3 text-left text-sm text-gray-700 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200 ${className}`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          size={16}
          className={`ml-2 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && panelStyle
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              style={panelStyle}
              className="z-50 max-h-64 overflow-auto rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-900"
            >
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => handleSelect(opt.value)}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    opt.value === value ? "bg-primary/5 font-medium text-primary" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === value ? <Check size={14} className="shrink-0" /> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
