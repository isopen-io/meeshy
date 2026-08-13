/**
 * Catch-up DELTA de la liste de conversations — valeurs pures.
 *
 * Miroir web de `ConversationSyncEngine.deltaSyncCore` / `mergeDeltaConversations`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`).
 * Même endpoint (`GET /conversations?updatedSince=`), mêmes sémantiques d'upsert,
 * même repli sur la vérité serveur. Ce n'est pas une seconde interprétation de la
 * règle : toute évolution touche les deux fichiers.
 *
 * ## Pourquoi un delta et pas un `refetch()`
 *
 * `refetch()` sur une `useInfiniteQuery` rejoue TOUTES les pages chargées, et
 * `GET /conversations` est une route lourde (participants, dernier message avec
 * ses traductions et sa pièce jointe, compteurs de non-lus calculés par curseur).
 * Payer N pages à chaque reconnexion de socket pour, la plupart du temps, zéro
 * changement, est le mauvais échange. Le delta est UNE requête bornée par ce qui
 * a réellement bougé — c'est exactement ce que fait iOS depuis toujours, et le
 * gateway porte un index dédié (`@@index([isActive, updatedAt])`).
 *
 * ## Le watermark se DÉDUIT du cache, il ne se stocke pas
 *
 * iOS garde un curseur explicite parce que son cache disque et son curseur sont
 * deux stockages distincts. Ici les deux sont le même objet : le plus récent
 * `updatedAt` présent dans le cache EST le watermark, et il est correct sans
 * horloge locale ni persistance.
 *
 * La preuve qu'il est conservateur : soit `T` le max des `updatedAt` en cache et
 * `F` l'instant de la lecture serveur qui les a produits. Par construction
 * `T <= F`, et tout changement survenu APRÈS cette lecture porte un `updatedAt`
 * postérieur à `F`, donc strictement supérieur à `T`. Interroger `updatedSince=T`
 * ne peut donc rien rater ; au pire, il re-livre ce qui a changé dans `]T, F]`,
 * ce que l'upsert rend idempotent. Un event socket qui écrit dans le cache ne
 * peut que faire AVANCER `T` (ou le laisser en place) — jamais le corrompre.
 *
 * ## Sorties de liste : deux canaux, une borne résiduelle
 *
 * Le lot `deltas` ne porte que des lignes SERVIES — la clause serveur exige une
 * conversation `isActive` et un participant actif sans `deletedForMe`, donc elle
 * exclut par construction ce qui vient de partir. Deux canaux couvrent les
 * sorties :
 *   - une ligne rendue avec `isActive: false` (le serveur la sert encore) ;
 *   - `meta.deletedConversationIds`, calculé par le gateway sur la même borne
 *     `since` (fermeture, leave, ban, delete-for-me) — voir `tombstoneIds`.
 *     C'est le SEUL canal pour un leave ou un ban, qui n'écrivent que la ligne
 *     `Participant` et ne bougent donc pas `Conversation.updatedAt`.
 *
 * Reste une borne : une conversation HARD-supprimée en base ne laisse aucune
 * trace dans aucun des deux. iOS la couvre par un `fullSync` périodique ; le web
 * par `refetchOnMount: 'always'` sur la liste infinite et la réconciliation
 * complète de 24 h — que `deletedConversationIdsTruncated` déclenche aussi
 * quand la liste de tombstones déborde son plafond.
 */

import type { Conversation } from '@/types';

/** Timestamp exploitable d'une valeur `Date | string | undefined`, ou `null`. */
function timeOf(value: Conversation['updatedAt'] | undefined): number | null {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Plus récent `updatedAt` de la liste, à passer en `updatedSince`.
 *
 * `null` quand aucune entrée ne porte de date exploitable — y compris sur un
 * cache vide. Le repli n'est JAMAIS l'horloge de l'appareil : un client en
 * avance sur le serveur pousserait le watermark au-delà de mises à jour réelles
 * et les perdrait définitivement (règle R15b côté iOS).
 */
export function conversationDeltaWatermark(
  conversations: readonly Conversation[]
): Date | null {
  let newest: number | null = null;
  for (const conversation of conversations) {
    const ms = timeOf(conversation.updatedAt);
    if (ms === null) continue;
    if (newest === null || ms > newest) newest = ms;
  }
  return newest === null ? null : new Date(newest);
}

/** Clé de tri : ordre serveur (`orderBy: { lastMessageAt: 'desc' }`). */
function orderKey(conversation: Conversation): number {
  return timeOf(conversation.lastMessageAt) ?? timeOf(conversation.updatedAt) ?? 0;
}

export type ConversationDeltaMerge = {
  readonly merged: Conversation[];
  readonly removedIds: string[];
};

export type ConversationDeltaMergeOptions = {
  /**
   * `true` s'il reste des pages non chargées derrière la fenêtre courante
   * (`hasMore` de la dernière page). Par défaut `false` : sans information, on
   * insère — ne rien insérer perdrait une ligne, l'insérer au pire la duplique
   * jusqu'au prochain montage.
   */
  readonly hasMore?: boolean;

  /**
   * Conversation ouverte à l'écran, dont la pastille est forcée à zéro — la
   * SEULE exception à l'upsert intégral.
   *
   * Le gateway calcule le compteur pour TOUS les destinataires, lecteur
   * compris : un delta qui atterrit pendant qu'on lit rapporte le compteur
   * d'avant l'aller-retour `mark-as-read` et rallume le badge de la
   * conversation qu'on a sous les yeux. Le handler socket
   * `conversation:unread-updated` porte déjà exactement cette garde
   * (`useSocketCacheSync`) ; le delta est le second chemin d'écriture du même
   * compteur et doit la porter aussi. Miroir de la règle 1 de
   * `ConversationSyncEngine.reconcileUnread` (SDK iOS).
   *
   * ## Pourquoi la garde s'arrête là
   *
   * iOS porte une règle 2 — « lecture locale postérieure au dernier message
   * connu du serveur ⇒ 0 » — qui couvre AUSSI la conversation fermée dont
   * l'accusé de lecture traîne encore dans l'outbox. Elle repose sur
   * `userState.lastReadAt`, une frontière LOCALE que le modèle web ne porte
   * pas.
   *
   * La transposer en « le delta ne peut monter le compteur que s'il apporte un
   * `lastMessageAt` plus récent » est tentante et FAUSSE : côté iOS,
   * `markAsUnread` marche précisément parce qu'il EFFACE `lastReadAt`, ce qui
   * désarme la règle 2 et rend la main au serveur. Une transposition basée sur
   * `unreadCount` n'a pas cet interrupteur — elle rendrait un « marquer comme
   * non lu » fait sur un autre appareil définitivement invisible sur le web,
   * puisque cette action ne déplace aucun `lastMessageAt`. Un badge qui se
   * rallume une seconde après un reconnect se répare tout seul au
   * `conversation:unread-updated` qui suit ; un mark-as-unread perdu, non.
   *
   * Pour toute conversation NON ouverte, le non-lu du delta écrase toujours le
   * non-lu local sans réconciliation (voir la borne ci-dessus) — fermer
   * proprement le reste demande de faire voyager la frontière de lecture
   * jusqu'au modèle web, chantier de contrat, pas garde de fusion.
   */
  readonly openConversationId?: string | null;

  /**
   * `meta.deletedConversationIds` de la réponse : les conversations qui ont
   * QUITTÉ la vue de l'utilisateur depuis le watermark (fermées, quittées,
   * bannies, supprimées-pour-moi depuis un autre appareil).
   *
   * C'est le seul canal par lequel une sortie parvient au client : le lot
   * `deltas` ci-dessus ne porte que des lignes SERVIES, et la clause serveur
   * exclut précisément celles-là. Un leave ou un ban n'écrit même pas
   * `Conversation.updatedAt` — aucune trace ne pouvait remonter.
   *
   * Appliquées APRÈS les upserts : quand les deux flux du même lot se
   * contredisent, la sortie est le fait le plus spécifique, et la garder
   * affichée rendrait la purge inatteignable jusqu'à la réconciliation
   * complète (24 h).
   */
  readonly tombstoneIds?: readonly string[];
};

/**
 * Fusionne un lot delta dans la liste en cache, par id.
 *
 * Un delta actif fait un UPSERT (remplacement intégral, jamais un patch champ à
 * champ : il vient de la même route que la liste, avec la même projection, et
 * c'est la vérité serveur) — à la seule exception du compteur de non-lus de la
 * conversation OUVERTE, voir `ConversationDeltaMergeOptions`. Un delta
 * `isActive: false` retire l'entrée et son id est rendu à l'appelant, qui purge
 * les caches dérivés ; un retrait n'est JAMAIS écarté, quelle que soit sa place.
 *
 * Une conversation INCONNUE du cache et plus ancienne que la fenêtre chargée est
 * écartée tant qu'il reste des pages : elle vit dans une page non encore lue, et
 * l'insérer ici la ferait apparaître DEUX FOIS au prochain `fetchNextPage`, qui
 * la rapportera à sa place réelle. Une inconnue récente, elle, appartient bien à
 * la fenêtre et entre normalement.
 *
 * Le résultat est re-trié par `lastMessageAt` décroissant — l'ordre du serveur,
 * pour que les frontières de pages reconstruites gardent un sens.
 */
export function mergeConversationDelta(
  existing: readonly Conversation[],
  deltas: readonly Conversation[],
  options: ConversationDeltaMergeOptions = {}
): ConversationDeltaMerge {
  const byId = new Map(existing.map((conversation) => [conversation.id, conversation]));
  const removedIds: string[] = [];

  // Bas de la fenêtre chargée, mesuré avec la MÊME clé que le tri final : la
  // borne signifie « sous la dernière ligne visible », et la fenêtre est ordonnée
  // par `orderKey`.
  const windowFloor = existing.reduce<number | null>((min, conversation) => {
    const key = orderKey(conversation);
    return min === null || key < min ? key : min;
  }, null);

  for (const delta of deltas) {
    if (delta.isActive === false) {
      if (byId.delete(delta.id)) removedIds.push(delta.id);
      continue;
    }

    if (!byId.has(delta.id) && options.hasMore === true && windowFloor !== null) {
      if (orderKey(delta) < windowFloor) continue;
    }

    byId.set(
      delta.id,
      delta.id === options.openConversationId ? { ...delta, unreadCount: 0 } : delta
    );
  }

  // Après les upserts, jamais avant : voir `tombstoneIds`. Le `delete` filtre
  // lui-même les ids inconnus du cache — rapporter une purge qui n'a rien
  // retiré ferait supprimer des caches dérivés qui n'existent pas.
  for (const tombstoneId of options.tombstoneIds ?? []) {
    if (byId.delete(tombstoneId) && !removedIds.includes(tombstoneId)) {
      removedIds.push(tombstoneId);
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => orderKey(b) - orderKey(a));
  return { merged, removedIds };
}
