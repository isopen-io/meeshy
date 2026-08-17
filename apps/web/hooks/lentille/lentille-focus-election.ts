/**
 * `LentilleFocusElection` — WL-108 (LWS-8 §4.2, parité I-070/I-071).
 *
 * Le magasin de l'élu, VOLONTAIREMENT HORS de l'état React du point de
 * montage. C'est le portage fidèle de l'arbitrage iOS
 * (`apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElection
 * .swift`, GELÉ) : « il vit ici, dans un petit objet dédié, et non dans le
 * body de la liste : l'y porter re-diffuserait tous les rangs à chaque tick
 * de défilement ».
 *
 * Le défaut qu'il évite, côté web, est exactement le même. Un
 * `useState(focusedId)` dans `LentilleConversationListMount` re-rendrait le
 * point de montage — donc les vingt rangs — à CHAQUE franchissement de rang
 * pendant le défilement (`LentilleRow` est `memo`, mais son `onClick` est un
 * littéral de fermeture recréé à chaque rendu du parent : la mémoïsation ne
 * mord pas). Le critère de recette R2 (« < 1 ms/frame, zéro allocation »)
 * n'y survivrait pas.
 *
 * Ici, chaque rang s'abonne pour SON booléen (`useIsFocusedRow` ci-dessous,
 * `useSyncExternalStore`) : tous les abonnés sont notifiés, mais React ne
 * re-rend que ceux dont l'instantané a réellement changé (`Object.is`) —
 * c'est-à-dire les DEUX rangs concernés par un changement d'élu, jamais la
 * liste entière.
 *
 * `adopt` est GARDÉ par l'inégalité, comme son jumeau Swift : sans cette
 * garde, un défilement soutenu notifierait tous les abonnés une fois par
 * frame pour zéro changement visible.
 *
 * Ce fichier ne contient AUCUNE loi : l'élection elle-même
 * (`electFocusRow`, hystérésis) vit dans `packages/shared/utils/focus-curve.ts`
 * et est appelée par `useLentillePerspective`. Ce magasin ne fait que
 * PUBLIER son résultat.
 *
 * @see tasks/lentille-implementation-contract.md LWS-8, §4.2
 * @see apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentilleFocusElection.swift
 */
'use client';

import { useCallback, useSyncExternalStore } from 'react';

export class LentilleFocusElection {
  private electedId: string | null = null;
  private readonly subscribers = new Set<() => void>();

  constructor(electedId: string | null = null) {
    this.electedId = electedId;
  }

  /** `null` tant qu'aucune élection n'a eu lieu (liste vide, avant la première frame). */
  getElectedId = (): string | null => this.electedId;

  /** Écriture GARDÉE par l'inégalité — l'élu ne change qu'une fois par rang franchi, pas une fois par frame. */
  adopt(id: string | null): void {
    if (id === this.electedId) return;
    this.electedId = id;
    this.subscribers.forEach((notify) => notify());
  }

  subscribe = (notify: () => void): (() => void) => {
    this.subscribers.add(notify);
    return () => {
      this.subscribers.delete(notify);
    };
  };
}

/** Abonnement JAMAIS null-safe côté appelant : un rang rendu hors liste (test, aperçu) n'a pas d'élection. */
const NEVER_NOTIFIES = () => () => {};

/**
 * « Ce rang est-il l'élu ? » — un booléen PAR RANG, pas l'identifiant élu.
 * C'est ce qui fait bailler React sur les dix-huit rangs dont la réponse
 * n'a pas changé. `election` absente ⇒ `false` constant (aucun abonnement,
 * aucun coût) : `LentilleRow` reste rendable hors du point de montage.
 */
export function useIsFocusedRow(
  election: LentilleFocusElection | undefined,
  conversationId: string
): boolean {
  const subscribe = useCallback(
    (notify: () => void) => (election ? election.subscribe(notify) : NEVER_NOTIFIES()),
    [election]
  );
  const getSnapshot = useCallback(
    () => election?.getElectedId() === conversationId,
    [election, conversationId]
  );
  // SSR : aucun rang n'est élu avant la première mesure du défilement — la
  // carte de focus n'existe donc pas dans le HTML serveur, et l'hydratation
  // ne diverge pas (elle ne l'ajoute qu'après la première frame).
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
