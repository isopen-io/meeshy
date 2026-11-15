import type { ReactNode } from 'react';

import { callButtonGlassTreatment, type CallButtonTone } from '@/lib/calls/call-button-glass';
import { useGlassToneRef } from '@/lib/calls/use-pill-motion';

export type { CallButtonTone };

/**
 * **UN BOUTON DE L'ÉCRAN D'APPEL** (#8391) — le bouton rond de la vue « C
 * adapté », en quatre tenues, dont le verre est choisi par la loi pure
 * `callButtonGlassTreatment` (#17345, miroir de `CallButtonGlassRule` d'iOS) :
 *
 * - `disc` : DANS une pilule ou un rail. Un disque de verre dessiné — un voile
 *   et un liseré (`.glass-call-disc`, `styles/glass.css`) — SANS flou à lui :
 *   le seul `backdrop-filter` du groupe est celui de la pilule, pour tenir 60
 *   images par seconde. Jamais transparent ;
 * - `glass` : un bouton ISOLÉ qui flotte (Réduire, Grille, plein écran) — il
 *   porte son propre verre d'appel (`styles/glass.css`) ;
 * - `active` : l'état enclenché, rempli de blanc, glyphe sombre ;
 * - `danger` : Fin, le rouge.
 *
 * La cible fait 44 au moins. Sans légende visible, le libellé accessible est
 * doublé d'une infobulle (`title`) ; avec légende (rangées d'un groupe), la
 * légende est la chose lue et l'infobulle serait un doublon.
 *
 * Légendé, le bouton EST l'unité icône + légende (#8735) : la légende posée à
 * côté du bouton était une zone morte, et le doigt qui visait « Caméra » ne
 * déclenchait rien. Le rond (verre, tenue, taille) vit dans le bouton.
 */

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

const TONE_STYLE: Readonly<Record<Exclude<CallButtonTone, 'glass'>, { readonly background?: string; readonly color: string }>> = {
  disc: { color: 'var(--color-on-media)' },
  active: { background: 'var(--color-on-media)', color: 'var(--ios-indigo-950)' },
  danger: { background: 'var(--ios-error-strong)', color: 'var(--color-ios-on-brand)' },
};

export function CallButton({ label, glyph, onPress, tone = 'disc', prominent = false, pressed, expanded, controls, popup = false, disabled = false, caption, size = 48, data = {} }: CallButtonProps) {
  const treatment = callButtonGlassTreatment(tone);
  const glassRef = useGlassToneRef(treatment.blursBackdrop && prominent);
  const surface = treatment.blursBackdrop ? (prominent ? 'glass-call-prominent ' : 'glass-call ') : treatment.surface === 'drawn-disc' ? 'glass-call-disc ' : '';
  const round = `${surface}grid shrink-0 place-items-center rounded-full`;
  const roundStyle = tone === 'glass' ? { width: size, height: size } : { width: size, height: size, ...TONE_STYLE[tone] };
  const press = 'transition-transform active:scale-95 disabled:opacity-40 motion-reduce:transition-none';
  const aria = {
    'aria-label': label,
    ...(pressed === undefined ? {} : { 'aria-pressed': pressed }),
    ...(expanded === undefined ? {} : { 'aria-expanded': expanded }),
    ...(controls === undefined ? {} : { 'aria-controls': controls }),
    ...(popup ? { 'aria-haspopup': 'dialog' as const } : {}),
  };
  if (caption === undefined)
    return (
      <div className="flex flex-col items-center gap-1">
        <button ref={glassRef} type="button" {...aria} title={label} onClick={onPress} disabled={disabled} {...data} className={`${round} ${press}`} style={roundStyle}>
          {glyph}
        </button>
      </div>
    );
  return (
    <button type="button" {...aria} onClick={onPress} disabled={disabled} {...data} className={`flex shrink-0 flex-col items-center gap-1 rounded-2xl ${press}`}>
      <span ref={glassRef} className={round} style={roundStyle}>
        {glyph}
      </span>
      <span aria-hidden className="max-w-[4.5rem] truncate text-mini text-on-media">
        {caption}
      </span>
    </button>
  );
}
