import type { ReactNode } from 'react';

import { BRAND, EDGE, INK, SURFACE } from './tone';

export type AdminButtonTone = 'primary' | 'secondary' | 'danger';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

const TONE_STYLE: Readonly<Record<AdminButtonTone, { readonly className: string; readonly style: Readonly<Record<string, string>> }>> = {
  /* Un aplat de la marque, comme `AdminConfirmSheet` et `AdminErrorState` : jamais un dégradé vers
     l'indigo clair, sous lequel le texte blanc tombait à ~3:1. */
  primary: { className: 'text-ios-on-brand', style: { backgroundColor: BRAND, border: '1px solid transparent' } },
  secondary: { className: '', style: { backgroundColor: SURFACE, color: INK, border: `1px solid ${EDGE}` } },
  danger: {
    className: '',
    style: { backgroundColor: SURFACE, color: 'var(--color-danger)', border: '1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)' },
  },
};

/**
 * **LE BOUTON D'ADMINISTRATION** (#8876) — un seul dessin pour les gestes des fiches, de la
 * composition d'une diffusion et du barème : 44 px de haut, un aplat de la marque pour l'action
 * principale (un seul par écran), une surface bordée pour la secondaire, le ton du danger pour
 * ce qui retire ou ferme. Compact : jamais étiré sur la largeur d'une carte.
 *
 * `busy` désactive ET se dit (`aria-busy`) : un geste en cours ne repart pas.
 */
export function AdminButton({
  type = 'button',
  tone = 'secondary',
  disabled = false,
  busy = false,
  label,
  onClick,
  data,
  children,
}: {
  readonly type?: 'button' | 'submit';
  readonly tone?: AdminButtonTone;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  /** Le nom accessible quand le texte visible ne le dit pas assez. */
  readonly label?: string;
  readonly onClick?: () => void;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
  readonly children: ReactNode;
}) {
  const palette = TONE_STYLE[tone];
  const inactive = disabled || busy;
  return (
    <button
      {...data}
      type={type}
      disabled={inactive}
      aria-busy={busy}
      {...(label === undefined ? {} : { 'aria-label': label })}
      {...(onClick === undefined ? {} : { onClick })}
      className={`inline-flex items-center justify-center gap-2 rounded-chip px-4 text-body font-semibold disabled:cursor-not-allowed ${FOCUS} ${palette.className}`.trim()}
      style={{ ...palette.style, minHeight: 44, opacity: inactive ? 0.45 : 1, outlineColor: BRAND }}
    >
      {children}
    </button>
  );
}
