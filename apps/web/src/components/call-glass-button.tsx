import type { ReactNode } from 'react';

/**
 * **UN BOUTON DE L'ÉCRAN D'APPEL** (#8391) — le bouton rond de la vue « C
 * adapté », en quatre tenues :
 *
 * - `bare` : DANS une pilule ou un rail. Transparent : le verre est celui du
 *   groupe, jamais un verre sur du verre ;
 * - `glass` : un bouton ISOLÉ qui flotte (Réduire, Grille, plein écran) — il
 *   porte son propre verre d'appel (`styles/glass.css`) ;
 * - `active` : l'état enclenché, rempli de blanc, glyphe sombre ;
 * - `danger` : Fin, le rouge.
 *
 * La cible fait 44 au moins. Sans légende visible, le libellé accessible est
 * doublé d'une infobulle (`title`) ; avec légende (rangées d'un groupe), la
 * légende est la chose lue et l'infobulle serait un doublon.
 */

export type CallButtonTone = 'bare' | 'glass' | 'active' | 'danger';

type CallButtonProps = {
  readonly label: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly tone?: CallButtonTone;
  readonly prominent?: boolean;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly controls?: string;
  readonly popup?: boolean;
  readonly disabled?: boolean;
  readonly caption?: string;
  readonly size?: number;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
};

const TONE_STYLE: Readonly<Record<Exclude<CallButtonTone, 'glass'>, { readonly background: string; readonly color: string }>> = {
  bare: { background: 'transparent', color: 'white' },
  active: { background: 'white', color: 'var(--ios-indigo-950)' },
  danger: { background: 'var(--ios-error-strong)', color: 'white' },
};

export function CallButton({ label, glyph, onPress, tone = 'bare', prominent = false, pressed, expanded, controls, popup = false, disabled = false, caption, size = 48, data = {} }: CallButtonProps) {
  const glass = tone === 'glass';
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={label}
        {...(caption === undefined ? { title: label } : {})}
        {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
        {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}
        {...(controls === undefined ? {} : { 'aria-controls': controls })}
        {...(popup ? { 'aria-haspopup': 'dialog' as const } : {})}
        onClick={onPress}
        disabled={disabled}
        {...data}
        className={`${glass ? (prominent ? 'glass-call-prominent ' : 'glass-call ') : ''}grid shrink-0 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-40 motion-reduce:transition-none`}
        style={glass ? { width: size, height: size } : { width: size, height: size, ...TONE_STYLE[tone] }}
      >
        {glyph}
      </button>
      {caption === undefined ? null : (
        <span aria-hidden className="max-w-[4.5rem] truncate text-mini text-white">
          {caption}
        </span>
      )}
    </div>
  );
}
