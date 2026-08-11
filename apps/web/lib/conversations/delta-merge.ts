/**
 * Règles PURES du delta-sync de la liste de conversations — miroir WEB de
 * `ConversationSyncEngine.mergeDeltaConversations` / `saveSorted` /
 * `reconcileUnread`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift`)
 * et de `SyncWatermark.advanced`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/SyncWatermark.swift`).
 *
 * Le rattrapage de la liste après une coupure socket se lit en delta —
 * `GET /conversations?updatedSince=` — jamais en refetch : un refetch d'infinite
 * query relit TOUTES les pages et REMPLACE le cache, ce qui perd les écritures
 * que le socket y a faites. Le gateway indexe précisément ce filtre
 * (`@@index([isActive, updatedAt])`, `packages/shared/prisma/schema.prisma`).
 *
 * Ce module est une VALEUR PURE : aucune connaissance de React Query, aucun I/O.
 * Ce n'est pas une seconde interprétation de la règle — toute évolution touche
 * les deux plateformes.
 */

import type { Conversation } from '@meeshy/shared/types';

/**
 * Millisecondes d'un champ date du cache. La liste est persistée en IndexedDB :
 * une valeur réhydratée revient en chaîne ISO là où le chemin REST fabrique un
 * `Date`. Les deux formes coexistent donc légitimement dans le même cache.
 */
function timeMs(value: Date | string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Ancre d'ordre d'une ligne de liste : le message le plus récent, à défaut la
 *  dernière écriture serveur, à défaut la création. iOS trie sur le seul
 *  `lastMessageAt` (non optionnel côté Swift) ; les replis n'existent ici que
 *  parce que le type web l'autorise absent — une conversation créée vide. */
function recencyMs(conversation: Conversation): number {
  return (
    timeMs(conversation.lastMessageAt) ??
    timeMs(conversation.updatedAt) ??
    timeMs(conversation.createdAt) ??
    0
  );
}

/**
 * Le compteur de non-lus du serveur, arbitré contre celui déjà en cache.
 *
 * Le delta peut TOUJOURS baisser la pastille — c'est ainsi qu'une lecture faite
 * sur un autre appareil arrive. Il ne peut la MONTER que s'il apporte aussi un
 * message plus récent : sans cette borne, un instantané serveur antérieur à un
 * `mark-as-read` encore en vol rallume la pastille que l'utilisateur vient
 * d'éteindre (« ça part puis ça revient »).
 *
 * iOS exprime la même intention avec sa frontière locale `userState.lastReadAt`,
 * que le modèle web ne porte pas ; `lastMessageAt` est le champ dont les deux
 * plateformes disposent pour dire « rien de neuf depuis ».
 */
export function reconcileDeltaUnread(
  incoming: Conversation,
  local: Conversation | undefined
): Conversation {
  if (!local) return incoming;

  const incomingUnread = incoming.unreadCount ?? 0;
  const localUnread = local.unreadCount ?? 0;
  if (incomingUnread <= localUnread) return incoming;

  const incomingLastMessage = timeMs(incoming.lastMessageAt);
  const localLastMessage = timeMs(local.lastMessageAt);
  const carriesNewerMessage =
    incomingLastMessage !== null &&
    (localLastMessage === null || incomingLastMessage > localLastMessage);
  if (carriesNewerMessage) return incoming;

  return { ...incoming, unreadCount: localUnread };
}

export type DeltaMergeOptions = {
  /** Conversation actuellement ouverte à l'écran, dont la pastille est forcée à
   *  zéro : le gateway émet le compteur à TOUS les destinataires, y compris le
   *  lecteur. Même garde que le handler socket `conversation:unread-updated`. */
  readonly openConversationId?: string | null;
};

export type DeltaMergeResult = {
  readonly merged: readonly Conversation[];
  /** Lignes que le delta a marquées inactives — leur cache de messages doit être
   *  purgé par l'appelant, comme `cache.messages.invalidate(for:)` sur iOS. */
  readonly removedIds: readonly string[];
};

/**
 * Applique un lot de conversations delta sur le contenu du cache, par id : une
 * ligne active fait un upsert (remplace sur place, sinon ajoute en fin), une
 * ligne inactive retire. O(existing + deltas), et l'ordre rendu n'est PAS
 * significatif — l'appelant re-trie via `sortConversationsByRecency`, comme
 * `saveSorted` sur iOS.
 *
 * Le retrait est DÉFENSIF sur cet endpoint : `GET /conversations` filtre déjà
 * `isActive: true`, donc une ligne inactive n'y transite pas. Il est conservé
 * pour que la règle reste identique des deux côtés.
 */
export function mergeDeltaConversations(
  existing: readonly Conversation[],
  deltas: readonly Conversation[],
  options: DeltaMergeOptions = {}
): DeltaMergeResult {
  if (deltas.length === 0) return { merged: existing, removedIds: [] };

  const byId = new Map<string, Conversation>(existing.map((c) => [c.id, c]));
  const removedIds: string[] = [];

  for (const delta of deltas) {
    if (delta.isActive === false) {
      if (byId.delete(delta.id)) removedIds.push(delta.id);
      continue;
    }
    const reconciled = reconcileDeltaUnread(delta, byId.get(delta.id));
    byId.set(
      delta.id,
      delta.id === options.openConversationId
        ? { ...reconciled, unreadCount: 0 }
        : reconciled
    );
  }

  return { merged: [...byId.values()], removedIds };
}

/** Ordre de la liste : message le plus récent en tête. `Array.prototype.sort`
 *  est stable (ES2019), donc deux lignes de même ancre gardent leur ordre. */
export function sortConversationsByRecency(
  conversations: readonly Conversation[]
): Conversation[] {
  return [...conversations].sort((a, b) => recencyMs(b) - recencyMs(a));
}

/**
 * Curseur `updatedSince` du prochain delta : le plus récent `updatedAt` SERVEUR
 * parmi les lignes détenues, en ISO 8601. `null` sur un cache vide — il n'y a
 * alors rien à rattraper, et le montage relit déjà le serveur
 * (`refetchOnMount: 'always'`).
 *
 * Deux différences assumées avec iOS, qui persiste son curseur dans
 * `UserDefaults` :
 * 1. **Le curseur se CALCULE, il ne se stocke pas.** Il décrit exactement ce que
 *    le cache détient, et n'a donc aucune purge d'identité à orchestrer au
 *    logout — un curseur persisté qui survivrait au changement de compte
 *    figerait la liste du suivant.
 * 2. **Il est borné par `now`.** La comparaison est faite côté serveur contre
 *    des `updatedAt` serveur ; une valeur future en cache (horloge d'appareil en
 *    avance ayant écrit une ligne, cache corrompu) pousserait la fenêtre
 *    au-delà de vraies mises à jour. Le clamp ne peut qu'ÉLARGIR la fenêtre :
 *    au pire on relit des lignes déjà détenues, jamais on n'en saute.
 */
export function conversationDeltaWatermark(
  conversations: readonly Conversation[],
  now: Date
): string | null {
  const newest = conversations.reduce<number | null>((max, conversation) => {
    const ms = timeMs(conversation.updatedAt);
    if (ms === null) return max;
    return max === null || ms > max ? ms : max;
  }, null);

  if (newest === null) return null;
  return new Date(Math.min(newest, now.getTime())).toISOString();
}
