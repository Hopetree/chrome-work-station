import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** 触发按钮的无障碍名称（表单标签文本） */
  ariaLabel?: string;
  /** 附加到根元素的类名，用于控制宽度等 */
  className?: string;
}

/**
 * 项目统一的下拉选择组件：禁用原生 select 的默认外观。
 * 面板、选中态、悬停态与整体青绿/冷灰设计语言一致。
 */
export default function Select({
  value,
  options,
  onChange,
  id,
  placeholder,
  disabled,
  ariaLabel,
  className = '',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const openPanel = () => {
    if (disabled) return;
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    // 视口下方放不下 240px 的面板且上方足够时，向上展开
    const rect = rootRef.current?.getBoundingClientRect();
    setDropUp(!!rect && window.innerHeight - rect.bottom < 240 && rect.top > 240);
    setOpen(true);
  };

  const closePanel = () => {
    setOpen(false);
    // 焦点回到触发器，键盘操作不中断
    triggerRef.current?.focus();
  };

  const selectOption = (optionValue: string) => {
    onChange(optionValue);
    closePanel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[activeIndex];
      if (option) selectOption(option.value);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? closePanel() : openPanel())}
        className={`flex w-full items-center justify-between gap-2 rounded-md border bg-white px-3 py-1.5 text-left text-[13px] outline-none transition ${
          open ? 'border-teal-500 ring-1 ring-teal-500' : 'border-zinc-200 hover:border-teal-500'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <span className={`truncate ${selected ? 'text-zinc-800' : 'text-zinc-400'}`}>
          {selected?.label ?? placeholder ?? '请选择'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={placeholder}
          className={`panel-anim absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg ${
            dropUp ? 'bottom-full mb-1' : 'top-full'
          }`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  ref={index === activeIndex ? activeItemRef : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option.value)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                    index === activeIndex ? 'bg-teal-50 text-teal-800' : 'text-zinc-700'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-teal-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
