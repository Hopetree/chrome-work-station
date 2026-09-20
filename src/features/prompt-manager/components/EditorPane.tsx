import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

/** 编辑器正文的行高（与 leading-7 保持一致） */
const LINE_HEIGHT = 28;
/** textarea 的垂直内边距（py-3） */
const PADDING_Y = 12;

interface EditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  wrapEnabled: boolean;
  /** textarea 的附加类名 */
  className?: string;
}

/**
 * 带行号栏的编辑器。
 *
 * 行号规则（与代码编辑器一致）：
 * - 不换行：每个逻辑行占一行，行号一一对应
 * - 自动换行：逻辑行折行后仍只标一个行号，折行出来的续行不显示行号
 *
 * 实现方式：用一个与 textarea 同字体、同宽度的隐藏镜像元素承载同样的文本，
 * 由浏览器真实排版后读取每个逻辑行的 offsetTop，行号据此绝对定位。
 */
export default function EditorPane({
  value,
  onChange,
  onKeyDown,
  placeholder,
  wrapEnabled,
  className = '',
}: EditorPaneProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [lineTops, setLineTops] = useState<number[]>([]);
  const [contentHeight, setContentHeight] = useState(0);

  const lines = value.split('\n');
  const lineCount = lines.length;

  const measure = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    // 先让镜像与 textarea 同宽，再读取每个逻辑行的排版位置
    mirror.style.width = `${textarea.clientWidth}px`;
    const tops = Array.from(mirror.children, (child) => (child as HTMLElement).offsetTop);
    setLineTops((prev) =>
      prev.length === tops.length && prev.every((top, i) => top === tops[i]) ? prev : tops,
    );
    setContentHeight(textarea.scrollHeight);
  }, []);

  // 内容或换行模式变化后重新测量（合并到一帧内，避免每次按键都强制排版）
  useLayoutEffect(() => {
    if (!wrapEnabled) return;
    const raf = requestAnimationFrame(() => measure());
    return () => cancelAnimationFrame(raf);
  }, [wrapEnabled, value, measure]);

  // 编辑器宽度变化（窗口缩放、目录折叠等）会改变折行位置
  useEffect(() => {
    if (!wrapEnabled) return;
    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [wrapEnabled, measure]);

  const handleScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div
        ref={gutterRef}
        aria-hidden
        className="w-11 shrink-0 select-none overflow-hidden border-r border-zinc-100 bg-zinc-50 text-right font-mono text-[12px] leading-7 text-zinc-300"
      >
        {wrapEnabled ? (
          <div className="relative" style={{ height: contentHeight }}>
            {lineTops.map((top, index) => (
              <span key={index} className="absolute right-2" style={{ top: top + PADDING_Y }}>
                {index + 1}
              </span>
            ))}
          </div>
        ) : (
          <div className="py-3">
            <LineNumbers count={lineCount} />
          </div>
        )}
      </div>

      {/* 隐藏镜像：仅用于测量折行后的行位置 */}
      {wrapEnabled && (
        <div
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 -z-10 overflow-hidden px-4 font-mono text-[13px] leading-7 whitespace-pre-wrap break-words"
        >
          {lines.map((line, index) => (
            <div key={index}>{line === '' ? '\u200b' : line}</div>
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={handleScroll}
        placeholder={placeholder}
        spellCheck={false}
        wrap={wrapEnabled ? 'soft' : 'off'}
        style={{ lineHeight: `${LINE_HEIGHT}px` }}
        className={`min-h-0 flex-1 resize-none px-4 py-3 font-mono text-[13px] text-zinc-800 outline-none placeholder:text-zinc-300 ${
          wrapEnabled ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
        } ${className}`}
      />
    </div>
  );
}

/** 行号栏内容：只在行数变化时重渲染 */
const LineNumbers = memo(function LineNumbers({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pr-2">
          {i + 1}
        </div>
      ))}
    </>
  );
});
