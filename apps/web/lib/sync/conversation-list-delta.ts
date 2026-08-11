/**
 * Rattrapage de la LISTE de conversations — miroir WEB de `deltaSyncCore`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`) et
 * de ses deux règles jumelles, `mergeDeltaConversations` et `reconcileUnread`.
 *
 * Le socket est la source de vérité temps réel de la liste (`staleTime: Infinity`
 * global). Ce qu'il n'a PAS pu livrer — coupure socket sans coupure réseau :
 * redémarrage gateway, drop du load balancer, échec d'upgrade de transport — ne
 * se rattrape donc nulle part : `refetchOnReconnect` du QueryClient écoute le
 * `onlineManager` (réseau navigateur), pas la socket.
 *
 * Le rattrapage est un DELTA `?updatedSince=`, jamais un `refetch()` : un refetch
 * REMPLACE les pages en cache et perd ce que le socket y a écrit depuis (même
 * raison que `syncNewerMessages` côté fil de messages). Le delta est upsert-only
 * et ne touche que les lignes que le serveur déclare modifiées.
 *
 * Ce module est une VALEUR PURE — aucune I/O, aucun accès au QueryClient. Toute
 * évolution de la règle touche ce fichier ET son jumeau iOS.
 */

import type { Conversation } from '@meeshy/shared/types';

const timeOf = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Borne du prochain delta : le `updatedAt` le plus récent de la liste en cache.
 *
 * C'est une lecture d'horloge SERVEUR, jamais `Date.now()` (R15b côté iOS) — un
 * device en avance sur le serveur pousserait la borne au-delà de mises à jour
 * réelles tombant dans `[serverNow, deviceNow]` et les perdrait définitivement.
 * Recalculée depuis le cache à chaque passe : le résultat du delta y est fusionné,
 * donc la borne ne peut que progresser, et aucun curseur n'a besoin d'être
 * persisté (le cache React Query EST le curseur).
 *
 * `null` = rien de lisible en cache : il n'y a pas de « depuis quand » à
 * demander, et le montage relit déjà tout (`refetchOnMount: 'always'`).
 */
export function conversationDeltaWatermark(conversations: readonly Conversation[]): string | null {
  const newest = conversations.reduce<number | null>((max, conversation) => {
    const ms = timeOf(conversation.updatedAt);
    if (ms === null) return max;
    return max === null || ms > max ? ms : max;
  }, null);

  return newest === null ? null : new Date(newest).toISOString();
}

/**
 * Le compteur serveur ne doit jamais RALLUMER un non-lu déjà éteint localement.
 *
 * Miroir de `reconcileUnread` (iOS), exprimé avec les données dont dispose le
 * web : un `unreadCount` local à 0 signifie « lu jusqu'à `lastMessageAt` ». Si le
 * delta ne rapporte aucun message plus récent que cette frontière, son compteur
 * non nul est un accusé de lecture en retard côté serveur — pas un vrai non-lu.
 * Dès qu'un message PLUS RÉCENT existe, la vérité serveur reprend la main : c'est
 * exactement ce que le rattrapage doit faire remonter.
 */
function reconcileUnread(incoming: Conversation, local: Conversation | undefined): Conversation {
  if (!local || (local.unreadCount ?? 0) !== 0) return incoming;

  const localFrontier = timeOf(local.lastMessageAt);
  const incomingLast = timeOf(incoming.lastMessageAt);
  if (localFrontier === null || incomingLast === null) return incoming;
  if (incomingLast > localFrontier) return incoming;

  return { ...incoming, unreadCount: 0 };
}

export type MergeConversationDeltasInput = {
  /** Liste à plat actuellement en cache, dans l'ordre d'affichage. */
  readonly existing: Conversation[];
  /** Lignes que le serveur déclare modifiées depuis la borne. */
  readonly deltas: readonly Conversation[];
  /** `true` s'il reste des pages non chargées derrière la fenêtre courante. */
  readonly hasMore: boolean;
};

/**
 * Fusionne un delta dans la liste en cache : upsert par id, retrait des
 * `isActive: false`, puis retour à l'ordre serveur (`lastMessageAt` décroissant).
 *
 * Trois arbitrages portent cette fonction :
 *
 * 1. **Upsert, jamais remplacement.** Une conversation que le delta ne mentionne
 *    pas est intacte — c'est ce qui distingue ce chemin d'un `refetch()`.
 * 2. **Une inconnue plus ancienne que la fenêtre chargée est ÉCARTÉE tant que
 *    `hasMore`.** Elle vit dans une page non encore chargée : l'insérer ici la
 *    dupliquerait au prochain `fetchNextPage`. Liste entièrement chargée, il n'y
 *    a pas de page suivante pour la porter — on l'insère.
 * 3. **Le tri est celui du serveur** (`orderBy: lastMessageAt desc`), pas un ordre
 *    inventé : une conversation qui a reçu des messages pendant la coupure doit
 *    remonter, sinon la ligne affiche le bon aperçu à la mauvaise place.
 *    L'épinglage reste intact — il est appliqué en partition côté vue.
 *
 * Rend la référence `existing` telle quelle quand rien ne change, pour que
 * l'appelant puisse sauter l'écriture de cache (et le re-render).
 */
export function mergeConversationDeltas({
  existing,
  deltas,
  hasMore,
}: MergeConversationDeltasInput): Conversation[] {
  if (deltas.length === 0) return existing;

  const localById = new Map(existing.map((conversation) => [conversation.id, conversation]));
  const oldestLoaded = existing.reduce<number | null>((min, conversation) => {
    const ms = timeOf(conversation.lastMessageAt);
    if (ms === null) return min;
    return min === null || ms < min ? ms : min;
  }, null);

  const upserts = new Map<string, Conversation>();
  const removed = new Set<string>();

  for (const delta of deltas) {
    if (!delta.isActive) {
      removed.add(delta.id);
      upserts.delete(delta.id);
      continue;
    }

    const local = localById.get(delta.id);
    if (!local && hasMore && oldestLoaded !== null) {
      const deltaLast = timeOf(delta.lastMessageAt);
      if (deltaLast !== null && deltaLast < oldestLoaded) continue;
    }

    removed.delete(delta.id);
    upserts.set(delta.id, reconcileUnread(delta, local));
  }

  const removesSomething = [...removed].some((id) => localById.has(id));
  if (upserts.size === 0 && !removesSomething) return existing;

  const merged = existing
    .filter((conversation) => !removed.has(conversation.id))
    .map((conversation) => upserts.get(conversation.id) ?? conversation);

  const inserted = [...upserts.values()].filter((delta) => !localById.has(delta.id));

  return [...merged, ...inserted].sort((a, b) => (timeOf(b.lastMessageAt) ?? 0) - (timeOf(a.lastMessageAt) ?? 0));
}
