import { useSyncExternalStore, type FocusEventHandler, type ReactNode } from 'react';

import { isWide, subscribeWide } from '@/lib/view/split-query';

/**
 * LA BANDE BASSE DU FIL — le composeur, ou le bandeau qui le remplace
 * (`ThreadWriteLock`, #9928) : UNE pose, partagée par les deux.
 *
 * AU TÉLÉPHONE, LA BANDE ENTIÈRE PORTE LE VERRE (#7143, D-51) : le fil passe
 * dessous et s'y floute, d'un bord de l'écran à l'autre.
 *
 * SUR ORDINATEUR (#10101), LE VERRE SE POSE SUR LA COLONNE SEULE — un dock au
 * rayon du composeur (22), filet et lueur à l'accent (`styles/thread-desktop.css`).
 * La bande pleine largeur recouvrait la lueur d'accent de #10004 sur toute la
 * largeur du volet et se lisait comme une dalle ; le fil, lui, ne court que
 * dans la colonne (`thread-column.css`) : rien ne passe sous les bords
 * découverts, rien n'y transparaît. La matière reste celle du site unique
 * (`glass-prominent`, `styles/glass.css`) — seul l'élément qui la porte change.
 *
 * La STRUCTURE ne change pas d'un gabarit à l'autre (le dock existe toujours,
 * sans verre au téléphone) : franchir 1024 px déplace une classe, il ne
 * remonte pas le composeur ni son brouillon en cours.
 */
export function ThreadComposerChrome({
  children,
  onFocus,
  onBlur,
}: {
  readonly children: ReactNode;
  readonly onFocus?: FocusEventHandler<HTMLDivElement>;
  readonly onBlur?: FocusEventHandler<HTMLDivElement>;
}) {
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  return (
    <div
      className={wide ? 'thread-composer-chrome thread-column' : 'thread-composer-chrome thread-column glass-prominent'}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className={wide ? 'thread-composer-dock glass-prominent' : 'thread-composer-dock'}>{children}</div>
    </div>
  );
}
