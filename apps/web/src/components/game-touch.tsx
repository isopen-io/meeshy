import type { CSSProperties, ReactNode } from 'react';

import { detailStore } from '@/lib/view/detail-store';
import type { ElementDetail } from '@/lib/view/game-detail';
import { gameText } from '@/lib/view/game-copy';

import { PRESS } from './game-press';

/**
 * UN ÉLÉMENT QUI SE TOUCHE (#9563, amendement n° 2) — un badge, un trophée, une
 * pastille, une ligne de donnée, le blason de l'en-tête. Un vrai `<button>` :
 * le doigt, la souris, Entrée et Espace l'ouvrent pareil, et le rebond est celui
 * de tout le jeu (`.game-press`, `styles/game.css`).
 *
 * Il ne sait rien de la modale : il dépose les précisions de SON élément dans le
 * magasin de la page (`detailStore`), avec lui-même pour que le focus lui
 * revienne. `detail` absent (la passerelle ne sert pas l'élément) : rien à
 * ouvrir, donc pas de bouton — le contenu se rend tel quel.
 *
 * `named` : le contenu est un dessin (décoratif) ; le bouton porte alors le nom
 * de l'élément. Sans `named`, le contenu est du texte et se lit tel quel.
 */
export { PRESS };

export function GameTouch({
  detail,
  named = false,
  className = '',
  style,
  marker,
  children,
}: {
  readonly detail: ElementDetail | null;
  readonly named?: boolean;
  /** Des attributs `data-*` de plus, pour qui cherche CE bouton (l'en-tête, un témoin). */
  readonly marker?: Readonly<Record<`data-${string}`, string>>;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children: ReactNode;
}) {
  if (detail === null) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-detail={detail.id}
      data-detail-name={detail.name}
      aria-haspopup="dialog"
      {...marker}
      {...(named ? { 'aria-label': gameText('game.detail.open', { name: detail.name }) } : {})}
      onClick={(event) => detailStore.open(detail, event.currentTarget)}
      className={`${PRESS} text-start ${className}`}
      style={style}
    >
      {children}
    </button>
  );
}

/**
 * Ce qu'un bouton DÉJÀ ÉCRIT (une étape de saison, qui se réclame quand elle est
 * prête) reçoit pour ouvrir les précisions de son élément : les mêmes marques et
 * le même toucher que `GameTouch`, à étaler sur lui.
 */
export function touchProps(detail: ElementDetail) {
  return {
    'data-detail': detail.id,
    'data-detail-name': detail.name,
    'aria-haspopup': 'dialog' as const,
    onClick: (event: { readonly currentTarget: HTMLElement }) => detailStore.open(detail, event.currentTarget),
  };
}
