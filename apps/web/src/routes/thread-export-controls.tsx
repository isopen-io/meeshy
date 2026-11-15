import type { ReactNode } from 'react';

import { Glyph } from '@/components/glyph';

/**
 * LES CONTRÔLES DU PLATEAU D'« IMAGINE » — une pilule à cocher, un groupe
 * titré. Verre sur verre, jamais : les tuiles DANS le plateau sont une teinte
 * d'encre, le verre est celui du plateau.
 */

export const REST = { backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 7%, transparent)', color: 'var(--color-ios-ink)' } as const;
export const PRESSED = { backgroundColor: 'var(--color-ios-ink)', color: 'var(--color-ios-surface)' } as const;

export function Pill({
  pressed,
  onClick,
  data,
  children,
  role,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly data: Readonly<Record<`data-${string}`, string>>;
  readonly children: string;
  /** `radio` dans un groupe de choix exclusifs — `aria-checked` y remplace `aria-pressed`. */
  readonly role?: 'radio';
}) {
  return (
    <button
      {...data}
      type="button"
      {...(role === 'radio' ? { role, 'aria-checked': pressed } : { 'aria-pressed': pressed })}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-full px-4 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 44, ...(pressed ? PRESSED : REST) }}
    >
      {pressed ? <Glyph name="check" size={14} /> : null}
      {children}
    </button>
  );
}

/** Un groupe titré : son nom lu d'abord, ses choix ensuite. `radiogroup` quand un seul choix vaut. */
export function Group({ label, children, exclusive = false, data }: { readonly label: string; readonly children: ReactNode; readonly exclusive?: boolean; readonly data?: Readonly<Record<`data-${string}`, string>> }) {
  return (
    <div {...data} role={exclusive ? 'radiogroup' : 'group'} aria-label={label} className="flex w-full flex-col gap-1.5">
      <p aria-hidden="true" className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink-2)' }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
