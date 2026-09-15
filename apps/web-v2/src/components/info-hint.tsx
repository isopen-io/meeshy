import { useId, useState, type CSSProperties } from 'react';

import { GlyphSvg, type GlyphShape } from './glyph';

/**
 * LE DÉTAIL DERRIÈRE UN (i) — UN composant pour tous les écrans d'entrée (#6441,
 * extrait par #6626).
 *
 * Directive porteur 2026-09-15 : « moins de détails sur la page de connexion et
 * d'enregistrement ; utiliser des (i) pour pouvoir informer sur le mode de
 * fonctionnement si naturellement ce n'est pas clair ». Le (i) vivait DANS
 * `Field` et, recopié à la main, sous le téléphone de l'inscription : la
 * connexion par e-mail en demande deux de plus HORS de tout champ (sous le
 * titre, et pendant l'attente). Une troisième et une quatrième copie auraient
 * dérivé au premier correctif — d'où ce site unique.
 *
 * DEUX morceaux et un état, parce que le bouton et la note ne vivent pas au même
 * endroit : le bouton se pose DANS le cadre d'un champ ou à côté d'un titre, la
 * note SOUS le bloc. `useInfoHint` tient l'identifiant qui les relie
 * (`aria-controls`) et l'état ouvert.
 *
 * **Replié ne veut pas dire absent.** La note reste dans le DOM en `sr-only` :
 * un champ la cite dans `aria-describedby`, et un lecteur d'écran l'entend sans
 * avoir à trouver le bouton.
 *
 * Le tracé vient de l'APPELANT, jamais d'un import ici — ce composant est au
 * socle, et le jeu d'écran qui porte `info` n'y entre pas (`extract-glyphs.mjs`).
 */

export type InfoHint = {
  readonly text: string;
  readonly glyph: GlyphShape;
  /** Le nom accessible du bouton — la QUESTION que la note répond
   * (« Comment ça marche », « Rien reçu ? »), jamais « Plus d'infos ». */
  readonly label: string;
};

export type InfoHintState = {
  readonly id: string;
  readonly isOpen: boolean;
  readonly toggle: () => void;
};

/** `fixedId` sert l'hôte dont un champ cite la note par un identifiant ÉCRIT
 * (`aria-describedby="signup-phone-hint"`) ; sinon `useId`. */
export function useInfoHint(fixedId?: string): InfoHintState {
  const generatedId = useId();
  const [isOpen, setOpen] = useState(false);
  return { id: fixedId ?? generatedId, isOpen, toggle: () => setOpen((open) => !open) };
}

export function InfoHintButton({
  hint,
  state,
  showsLabel = false,
  style,
}: {
  readonly hint: InfoHint;
  readonly state: InfoHintState;
  /** Le libellé LU en plus du glyphe — pour un (i) posé seul, loin de tout
   * champ ou titre qui dirait de quoi il parle. */
  readonly showsLabel?: boolean;
  readonly style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={state.toggle}
      aria-expanded={state.isOpen}
      aria-controls={state.id}
      aria-label={hint.label}
      className={showsLabel ? 'inline-flex items-center gap-1.5 text-caption font-medium' : 'grid shrink-0 place-items-center rounded-full'}
      style={{ minWidth: 44, minHeight: 44, color: 'var(--color-ios-ink-3)', ...style }}
    >
      <GlyphSvg glyph={hint.glyph} size={18} />
      {showsLabel ? <span>{hint.label}</span> : null}
    </button>
  );
}

export function InfoHintText({
  hint,
  state,
  className,
}: {
  readonly hint: InfoHint;
  readonly state: InfoHintState;
  readonly className?: string;
}) {
  const classes = ['text-caption', state.isOpen ? undefined : 'sr-only', className].filter((part) => part !== undefined);
  return (
    <p id={state.id} className={classes.join(' ')} style={{ color: 'var(--color-ios-ink-2)' }}>
      {hint.text}
    </p>
  );
}
