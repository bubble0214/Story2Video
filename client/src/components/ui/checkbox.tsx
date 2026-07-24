'use client';

import { cn } from '@/lib/utils';
import { useId } from 'react';

interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onCheckedChange, id, disabled }: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-primary/50 transition-colors cursor-pointer',
        checked ? 'bg-primary text-primary-foreground' : 'bg-transparent hover:border-primary',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        disabled={disabled}
        className="appearance-none absolute opacity-0"
      />
      {checked && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </label>
  );
}
