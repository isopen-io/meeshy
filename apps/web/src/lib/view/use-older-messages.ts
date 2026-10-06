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
 * lecteur. **C'est le VIRTUALISEUR qui tient l'ancre, et lui seul** (#9216,
 * #9219) : `useHeadAnchor` lui passe `anchorTo: 'end'` au rendu où la tête
 * change, et il repère, PENDANT ce rendu, la rangée posée à l'offset courant
 * et son décalage, déplace son propre offset sur la nouvelle position de
 * cette rangée AVANT de calculer la plage montée, puis écrit `scrollTop` dans
 * son effet de mise en page — avant la peinture.
 *
 * ### POURQUOI PLUS DE REPÈRE MAISON
 *
 * Ce hook tenait auparavant la DISTANCE AU BAS (`scrollHeight − scrollTop`),
 * capturée au DÉCLENCHEMENT et reposée en valeur ABSOLUE dans son propre effet
 * de mise en page. Deux ancrages se disputaient alors le défileur, et le
 * vainqueur dépendait d'une HORLOGE interne du virtualiseur :
 *
 * 1. Le virtualiseur ignore l'insertion : au commit qui l'apporte, il calcule
 *    encore sa plage pour l'ANCIEN offset — donc sur les rangées PRÉFIXÉES,
 *    jamais mesurées.
 * 2. Si la page arrive plus de 150 ms après le dernier `scroll`
 *    (`isScrollingResetDelay` — une page servie par le réseau, le cas
 *    nominal), il MESURE ces rangées dans le même commit et compense chacune
 *    par un `scrollTo` RELATIF, calculé sur son offset périmé.
 * 3. L'écriture ABSOLUE de ce hook effaçait ces compensations, alors que les
 *    tailles mesurées, elles, restaient : la croissance des rangées préfixées
 *    n'était plus compensée par personne, et le fil glissait de leur somme
 *    (179 px sur la CI de `main`, plusieurs écrans sous contention — mesuré
 *    au navigateur, `scrollHeight − scrollTop` passant de 8 334 à 11 654 px).
 * 4. Arrivée dans la fenêtre des 150 ms, la même page ne mesurait rien au
 *    commit, et le fil restait immobile. D'où un gate tantôt rouge, tantôt
 *    vert, sur le même code.
 *
 * Le repère capturé au déclenchement avait un second défaut, que le premier
 * masquait : il PÉRIMAIT pendant le vol de la page. Un lecteur qui continue de
 * remonter pendant 300 ms de réseau était ramené, à l'arrivée, là où la
 * sentinelle l'avait vu. L'ancre du virtualiseur se prend au rendu qui insère,
 * donc sur la position du moment.
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
  /** Le rejeu d'un refus : le MÊME geste que la sentinelle — la page qu'il
   * apporte change la tête, et c'est ce changement qui pose l'ancre. */
  readonly retry: () => void;
};

/** L'option `anchorTo` du virtualiseur — `'end'` le temps du seul rendu où la tête change. */
export type HeadAnchor = 'start' | 'end';

/**
 * LA LOI DE L'ANCRE, PURE. Une tête qui APPARAÎT (premier chargement) n'a rien
 * à tenir : aucune rangée n'était sous les yeux du lecteur. Une tête qui
 * DISPARAÎT (fil vidé) non plus. Seule une tête REMPLACÉE — une page préfixée,
 * une purge du haut, une fenêtre ancrée qui rejoint le présent — demande au
 * virtualiseur de garder en place la rangée qu'on lit ; s'il ne la retrouve
 * pas dans la nouvelle liste, il ne déplace rien.
 *
 * `'end'` est le nom que `@tanstack/virtual-core` donne à ce mode (le fil de
 * discussion, qu'on lit vers le bas et qu'on remonte) ; hors de ce rendu le
 * fil reste en `'start'`, son comportement d'avant ce lot.
 */
export function headAnchorOf(committedHead: string | undefined, renderedHead: string | undefined): HeadAnchor {
  return committedHead !== undefined && renderedHead !== undefined && committedHead !== renderedHead ? 'end' : 'start';
}

/**
 * `anchorTo` pour `useVirtualizer`, à appeler AVANT lui : c'est pendant SON
 * rendu (`setOptions`) qu'il compare les bords de la liste et repère sa rangée.
 * La tête de référence est la dernière COMMISE — relevée dans un effet de mise
 * en page, jamais écrite pendant le rendu.
 */
export function useHeadAnchor(firstMessageId: string | undefined): HeadAnchor {
  const committed = useRef(firstMessageId);
  useLayoutEffect(() => {
    committed.current = firstMessageId;
  });
  return headAnchorOf(committed.current, firstMessageId);
}

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

  /** Une page a été DEMANDÉE depuis le dernier changement de tête : le
   * déplacement que le virtualiseur fera à son arrivée est le nôtre. */
  const requested = useRef(false);

  const loadOlder = useCallback(() => {
    requested.current = true;
    fetchOlder();
  }, [fetchOlder]);

  const { observe } = useLoadMoreSentinel({
    root: scroller,
    rootMargin: OLDER_ROOT_MARGIN,
    enabled: state === 'idle' && rowCount > 0,
    onReach: loadOlder,
  });

  useLayoutEffect(() => {
    if (!requested.current) return;
    requested.current = false;
    /* ANNONCE le défilement PROGRAMMÉ : l'ancre que le virtualiseur vient de
       reposer n'est pas une intention de l'utilisateur, elle ne doit ni
       révéler ni armer la scène du fil (§5.8 de la spécification #5648, D-15). */
    noteProgrammaticScroll();
    // Volontairement sur la seule TÊTE du fil — voir le doc-comment § « la clé
    // de l'effet est la tête du fil, jamais le compte ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstMessageId]);

  return { state, sentinelRef: observe, retry: loadOlder };
}
