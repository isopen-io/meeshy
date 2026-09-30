import type { ReactNode } from 'react';

/**
 * Les champs du barème (#8906) — un nombre se TAPE : le champ garde le texte,
 * la loi partagée le relit à l'enregistrement.
 */

export const scaleTokens = {
  INK: 'var(--color-ios-ink)',
  INK2: 'var(--color-ios-ink-2)',
  SURFACE: 'var(--color-ios-surface)',
  EDGE: 'var(--color-edge)',
  BRAND: 'var(--color-ios-brand)',
} as const;

const FIELD = {
  minHeight: 40,
  backgroundColor: scaleTokens.SURFACE,
  border: `1px solid ${scaleTokens.EDGE}`,
  color: scaleTokens.INK,
} as const;
const FIELD_CLASS = 'w-24 rounded-chip px-3 text-body tabular-nums';

export function NumberField({
  value,
  label,
  placeholder,
  onChange,
  data,
}: {
  readonly value: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly onChange: (value: string) => void;
  readonly data: Readonly<Record<string, string>>;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      aria-label={label}
      {...(placeholder === undefined ? {} : { placeholder })}
      onInput={(event) => onChange(event.currentTarget.value)}
      className={FIELD_CLASS}
      style={FIELD}
      {...data}
    />
  );
}

/** Un réglage nommé, son champ à droite. */
export function LabeledNumber({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-body" style={{ color: scaleTokens.INK }}>
      <span>{label}</span>
      {children}
    </label>
  );
}
