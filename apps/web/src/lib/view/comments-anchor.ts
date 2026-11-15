import { useEffect, useRef, type RefObject } from 'react';

/**
 * **L'ANCRE DU FIL DE COMMENTAIRES — CE QUI L'ÉCRIT ET CE QUI L'HONORE, AU
 * MÊME ENDROIT** (#7113).
 *
 * Le compteur de commentaires d'une carte du fil mène au détail de la
 * publication « à son ancre de commentaires » — c'est ce que deux hôtes
 * écrivaient, et ce que rien ne faisait. Le routeur du dépôt ne lit PAS le
 * fragment (`readLocation()` ne retient que `pathname` et `search`,
 * `lib/router.tsx`), et sa restauration de défilement écrit `window.scrollTo`
 * alors que le détail défile dans son `<main>`. L'adresse portait donc un
 * `#commentaires` que personne ne consommait, et le lecteur atterrissait en
 * haut d'une carte pleine hauteur.
 *
 * iOS ne fait pas marcher son lecteur : le même compteur PRÉSENTE
 * `FeedCommentsSheet` (`FeedPostCard.swift:994-1007`). Le web n'a pas de
 * couche modale de fil — l'ancre est sa réponse, et c'est à elle d'arriver.
 *
 * **UN SEUL NOM.** Le mot était écrit trois fois (deux `#commentaires` chez
 * les hôtes, un `id="commentaires"` dans le détail) sans rien pour les tenir
 * ensemble : en renommer un rendait le geste muet en silence. `COMMENTS_ANCHOR`
 * est l'unique écriture, et les deux bouts la partagent.
 *
 * **SANS ANIMATION, DÉLIBÉRÉMENT.** Le lecteur a demandé les commentaires ; il
 * doit les TROUVER, pas y voyager. Un défilement doux ferait défiler la carte
 * sous ses yeux pendant plusieurs centaines de millisecondes avant d'arriver —
 * une lenteur, donc un bug (§ Roadmap, dimension 2), et une question de
 * `prefers-reduced-motion` qui ne se pose plus.
 */

/** LE nom de l'ancre — écrit ici et nulle part ailleurs. */
export const COMMENTS_ANCHOR = 'commentaires';

/** L'adresse d'une publication, portant son fil. */
export const withCommentsAnchor = (postHref: string): string => `${postHref}#${COMMENTS_ANCHOR}`;

/**
 * Le fragment servi par le navigateur vise-t-il CE fil ?
 *
 * Comparaison EXACTE une fois le `#` retiré : un préfixe suffisant ferait
 * répondre « oui » à `#commentaires-2`, une ancre voisine qu'un lot futur peut
 * très bien poser.
 */
export const targetsComments = (hash: string): boolean =>
  (hash.startsWith('#') ? hash.slice(1) : hash) === COMMENTS_ANCHOR;

/**
 * AMÈNE LE FIL SOUS LES YEUX, ET LA VOIX AVEC LUI.
 *
 * `scrollIntoView` plutôt qu'un `scrollTop` calculé : le détail défile dans
 * son `<main>`, et c'est au navigateur de savoir lequel de ses ancêtres
 * défile — une géométrie recalculée ici serait fausse le jour où l'écran
 * change de cadre.
 *
 * Le focus va à la RÉGION du fil, que `comment-thread.tsx` déclare déjà
 * focalisable au programme et NOMMÉE (« Commentaires ») : c'est ce qui rend
 * l'arrivée audible pour un lecteur d'écran, comme la feuille iOS qui prend le
 * focus en s'ouvrant. `preventScroll` parce que le défilement vient d'être
 * fait, et qu'un second, décidé par le navigateur, le contredirait.
 *
 * Sans région, on ne focalise RIEN : voler le focus pour le poser sur un
 * conteneur muet dirait moins que de le laisser où il est.
 */
export function revealComments(anchor: HTMLElement | null): void {
  if (anchor === null) return;
  anchor.scrollIntoView({ block: 'start', behavior: 'auto' });
  anchor.querySelector<HTMLElement>('[data-comment-thread]')?.focus({ preventScroll: true });
}

/**
 * À L'ARRIVÉE, UNE FOIS, ET SEULEMENT SI L'ADRESSE LE DEMANDE.
 *
 * `ready` est la publication SERVIE : le fil n'existe dans le document qu'une
 * fois la carte rendue (un refus n'en ouvre aucun, D-6), donc révéler au
 * montage viserait le vide.
 *
 * Et UNE SEULE fois : une page de commentaires qui arrive, une horloge qui
 * tourne, un geste sur une rangée sont autant de rendus — rejouer la
 * révélation à chacun ramènerait de force le lecteur qui vient de remonter
 * lire la publication.
 */
export function useCommentsReveal({
  anchor,
  ready,
  hash,
}: {
  readonly anchor: RefObject<HTMLElement | null>;
  readonly ready: boolean;
  readonly hash: string;
}): void {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready || !targetsComments(hash)) return;
    done.current = true;
    revealComments(anchor.current);
  }, [ready, hash, anchor]);
}
