import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

import { LOAD_MORE_LEAD_ROWS, type ListPaginationState } from '@/lib/lens/pagination';

import { useLoadMoreSentinel } from './use-load-more-sentinel';

/**
 * **L'HISTORIQUE, À L'APPROCHE DU HAUT DU FIL** (#6972) — miroir
 * `MessageListView.onLoadOlder` → `ConversationViewModel.loadOlderMessages()`
 * → `MessageStore.loadOlder(before:)` (iOS,
 * `ConversationViewModel+InitialLoad.swift:543-546`, `:363`, `:744`).
 *
 * EXTRAIT de `routes/thread.tsx` : le budget de taille du dépôt (CLAUDE.md
 * § Code Style) demande un découpage « sans se discuter » au-delà de 1 000
 * lignes, et l'écran les avait déjà. C'est le MÊME motif que
 * `use-thread-chrome-signals.ts`, `use-thread-insets.ts` et
 * `use-thread-typing.ts`, tous sortis de cet écran pour la même raison — et
 * l'arithmétique du repère devient mesurable sans monter tout le fil.
 *
 * ## UN SEUL DÉCLENCHEUR
 *
 * Le legacy `apps/web` en porte TROIS concurrents sur le même conteneur
 * (`use-conversation-messages-rq.ts:585-636`, `ConversationMessages.tsx:213-258`,
 * `messages-display.tsx:409-422`) et un ancrage purement implicite, confié à
 * l'`overflow-anchor` du navigateur. On ne copie pas ça. La sentinelle est le
 * hook GÉNÉRIQUE de la Lentille (`useLoadMoreSentinel`), dont le doc-comment
 * annonçait exactement cette réutilisation (« le fil réutilisera ce hook tel
 * quel », §8 de la spécification #6195).
 *
 * Elle n'est armée qu'à l'état `idle` (`hasNextPage` sans page en vol ni
 * erreur) ET sur un fil qui porte au moins une rangée : une sentinelle
 * immédiatement intersectée sur un écran sans rangée déclencherait une rafale
 * de requêtes pour un écran qui restera vide de toute façon — le défaut exact
 * que la revue-correction #6195 a corrigé sur la Lentille.
 *
 * ## L'ANCRAGE — CE QU'ON LIT NE DOIT PAS BOUGER
 *
 * Préfixer cinquante rangées fait grandir la liste virtualisée PAR LE HAUT :
 * sans correction, la fenêtre glisse d'un écran entier sous les yeux du
 * lecteur. On tient donc la DISTANCE AU BAS du contenu
 * (`scrollHeight − scrollTop`), la seule grandeur qu'une insertion EN TÊTE
 * laisse invariante, et on la repose dans un effet de MISE EN PAGE — avant la
 * peinture, jamais après.
 *
 * Les rangées préfixées ne sont pas encore MESURÉES à cet instant (elles
 * valent l'estimation) : leurs corrections de taille arrivent ensuite, et
 * c'est le virtualiseur qui les absorbe — il n'ajuste `scrollTop` que pour les
 * rangées situées AVANT l'offset courant, ce qui est précisément leur cas.
 * C'est le mécanisme que le critère 4 de
 * `scripts/check-thread-virtualization.mjs` mesure déjà ; son critère 5,
 * ajouté par ce lot, mesure celui-ci.
 *
 * ## LA CLÉ DE L'EFFET EST LA TÊTE DU FIL, JAMAIS LE COMPTE
 *
 * Le compte change aussi quand un message ARRIVE (en queue), et l'ancrage
 * n'aurait alors rien à défaire. L'identité de la TÊTE ne bouge que sur une
 * insertion en tête : **la donnée décide, pas un ordonnancement d'effets.**
 * C'est aussi ce qui laisse l'ancrage bas de l'écran (`pinToBottom`, clé sur
 * l'identité de la QUEUE) et celui-ci cohabiter sans se disputer le défileur.
 */
export type OlderMessages = {
  readonly state: ListPaginationState;
  /** À poser sur la PRISE d'état en tête du fil (`ref={sentinelRef}`) — réf de
   * RAPPEL de `useLoadMoreSentinel`. */
  readonly sentinelRef: (node: Element | null) => void;
  /** Le rejeu d'un refus : le MÊME geste que la sentinelle, capture du repère
   * comprise — un « Réessayer » qui sauterait l'ancrage ferait bondir le fil. */
  readonly retry: () => void;
};

/**
 * L'ESTIMATION D'UNE RANGÉE DU FIL — UNE valeur, deux lecteurs :
 * l'`estimateSize` du virtualiseur (`routes/thread.tsx`) et l'avance de la
 * sentinelle ci-dessous. Elle était en dur dans le premier ; l'écrire deux
 * fois aurait fait dériver l'avance de la pagination de la hauteur qu'elle
 * est censée mesurer.
 */
export const THREAD_ROW_ESTIMATE = 88;

/**
 * `rootMargin` du HAUT — l'avance de cinq rangées de la Lentille
 * (`LOAD_MORE_LEAD_ROWS`, miroir de `triggerLoadMoreIfNeeded`,
 * `ConversationListView.swift:1045-1060`), mais posée sur le bord du HAUT :
 * `loadMoreRootMargin` la met en BAS, c'est là que la Lentille pagine. Un fil
 * pagine vers le PASSÉ — l'avance est donc au-dessus de ce qu'on lit.
 */
const OLDER_ROOT_MARGIN = `${THREAD_ROW_ESTIMATE * LOAD_MORE_LEAD_ROWS}px 0px 0px 0px`;

export function useOlderMessages(params: {
  readonly scroller: RefObject<HTMLElement | null>;
  readonly state: ListPaginationState;
  /** Le nombre de rangées RENDUES — `0` désarme la sentinelle. */
  readonly rowCount: number;
  /** L'identité du PREMIER message rendu : elle ne change que sur une
   * insertion en tête (voir le doc-comment § « la clé de l'effet »). */
  readonly firstMessageId: string | undefined;
  readonly fetchOlder: () => void;
  readonly noteProgrammaticScroll: () => void;
}): OlderMessages {
  const { scroller, state, rowCount, firstMessageId, fetchOlder, noteProgrammaticScroll } = params;

  /** Le REPÈRE : la distance au bas du contenu au moment du déclenchement.
   * `null` ⇒ aucune page n'a été demandée depuis ce dernier changement de
   * tête, donc rien à reposer. */
  const pin = useRef<number | null>(null);

  const loadOlder = useCallback(() => {
    const el = scroller.current;
    if (el !== null) pin.current = el.scrollHeight - el.scrollTop;
    fetchOlder();
  }, [scroller, fetchOlder]);

  const { observe } = useLoadMoreSentinel({
    root: scroller,
    rootMargin: OLDER_ROOT_MARGIN,
    enabled: state === 'idle' && rowCount > 0,
    onReach: loadOlder,
  });

  useLayoutEffect(() => {
    const captured = pin.current;
    if (captured === null) return;
    pin.current = null;
    const el = scroller.current;
    if (el === null) return;
    /* ANNONCE le défilement PROGRAMMÉ : reposer l'ancre n'est pas une
       intention de l'utilisateur, elle ne doit ni révéler ni armer la scène du
       fil (§5.8 de la spécification #5648, D-15). */
    noteProgrammaticScroll();
    el.scrollTop = el.scrollHeight - captured;
    // Volontairement sur la seule TÊTE du fil — voir le doc-comment § « la clé
    // de l'effet est la tête du fil, jamais le compte ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstMessageId]);

  return { state, sentinelRef: observe, retry: loadOlder };
}
