import type { ReactNode } from 'react';

import { EDGE, INK, SURFACE } from '@/components/admin/tone';

/**
 * Les champs du barème (#8906) — un nombre se TAPE : le champ garde le texte,
 * la loi partagée le relit à l'enregistrement. Les jetons sont ceux du kit
 * d'administration (`components/admin/tone`), jamais une seconde table ; chaque
 * champ fait 44 px, la cible tactile minimale.
 */

const FIELD = {
  minHeight: 44,
  backgroundColor: SURFACE,
  border: `1px solid ${EDGE}`,
  color: INK,
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

/** Un réglage nommé, son champ à l'autre bout de la ligne. */
export function LabeledNumber({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-body" style={{ color: INK }}>
      <span className="min-w-0 break-words">{label}</span>
      {children}
    </label>
  );
}
