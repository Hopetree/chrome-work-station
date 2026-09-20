import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

interface CheckboxProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** 无障碍名称（当没有可见 label 时使用） */
  ariaLabel?: string;
}

/** 项目统一的勾选框（基于 Radix Checkbox，不使用原生 checkbox 默认外观） */
export default function Checkbox({
  id,
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
}: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[4px] border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-600 ${
        checked
          ? 'border-teal-700 bg-teal-700 text-white'
          : 'border-zinc-300 bg-white hover:border-teal-600'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
