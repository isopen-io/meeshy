/**
 * `useLentilleBridges` — résolution du pont ✦ par conversation (WL-103,
 * LWS-10 / LWS-2bis).
 *
 * `LocalBridgeProvider` (GELÉ, `packages/shared/providers/local/
 * LocalBridgeProvider.ts`) est le substitut consommé TEL QUEL — jamais
 * réécrit. Ce hook lui fournit la SEULE dépendance qu'il exige
 * (`LocalBridgeCacheReading`), et c'est ICI, honnêtement, que se documente
 * une limite réelle du web aujourd'hui :
 *
 * Aucun cache de messages COUVRANT TOUTES LES CONVERSATIONS n'existe côté
 * web — re-prouvé (`grep` sur `apps/web/stores/**` et `apps/web/hooks/**`) :
 * les messages sont chargés PAR conversation OUVERTE (React Query, clé
 * `conversationId`), jamais préchargés pour la liste entière. `NO_LOCAL_CACHE`
 * rend donc TOUJOURS `null` aux deux méthodes du protocole ⇒
 * `LocalBridgeProvider.bridgeFor` rend `null` pour toute conversation —
 * exactement le comportement DOCUMENTÉ du provider pour « rien en cache »,
 * jamais un pont fabriqué (contrainte « zéro donnée fabriquée », LWS-2bis).
 *
 * Le jour où un cache réel de messages existe, SEULE cette dépendance
 * change (garde du protocole gelé : aucune vue ne nomme
 * `LocalBridgeProvider` — voir sa propre en-tête) ; ce hook reste le SEUL
 * point d'injection à toucher.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { LocalBridgeProvider, type LocalBridgeCacheReading } from '@meeshy/shared/providers/local/LocalBridgeProvider';

export type LentilleBridgeCandidate = {
  readonly id: string;
  readonly unreadCount?: number;
};

const NO_LOCAL_CACHE: LocalBridgeCacheReading = {
  getCachedMessages: () => null,
  getUnreadWindow: () => null,
};

/**
 * Résout un pont ✦ par conversation via le substitut local. `cacheReading`
 * est injectable pour les tests (RE-PREUVE que le mécanisme fonctionne dès
 * qu'un cache réel existe) — la production n'en fournit pas et retombe sur
 * `NO_LOCAL_CACHE` (voir en-tête).
 */
export function useLentilleBridges(
  conversations: readonly LentilleBridgeCandidate[],
  viewerId: string | null | undefined,
  cacheReading: LocalBridgeCacheReading = NO_LOCAL_CACHE
): ReadonlyMap<string, ConversationBridge | null> {
  const [bridges, setBridges] = useState<ReadonlyMap<string, ConversationBridge | null>>(new Map());

  // `conversations` est fréquemment un LITTÉRAL recréé à chaque rendu côté
  // appelant (`.map()`/`.filter()` non mémoïsés) — dépendre de son IDENTITÉ
  // rendrait cet effet à chaque rendu, et `setBridges` en déclenchant un
  // nouveau ⇒ boucle infinie. La dépendance réelle du calcul n'est que
  // `(id, unreadCount)` par conversation : on la dérive en une clé stable et
  // on lit le tableau COURANT depuis une ref au moment de l'effet.
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const conversationsKey = conversations.map((c) => `${c.id}:${c.unreadCount ?? 0}`).join('|');

  useEffect(() => {
    const current = conversationsRef.current;
    if (!viewerId || current.length === 0) {
      setBridges(new Map());
      return;
    }

    let cancelled = false;
    const provider = new LocalBridgeProvider(cacheReading);

    Promise.all(
      current.map(async (conversation) => {
        const bridge = await provider.bridgeFor({
          conversationId: conversation.id,
          viewerId,
          unreadCount: conversation.unreadCount ?? 0,
        });
        return [conversation.id, bridge] as const;
      })
    ).then((entries) => {
      if (!cancelled) setBridges(new Map(entries));
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `conversationsKey` remplace intentionnellement `conversations` (voir commentaire ci-dessus)
  }, [conversationsKey, viewerId, cacheReading]);

  return bridges;
}
