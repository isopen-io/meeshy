import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { StarredMessageItem } from '@meeshy/shared/types/message-star';

import { writeCardCache } from './card-caches';

/**
 * **LES FAVORIS DE MESSAGES — LES CAISSES ET LEURS LOIS** (#7378, #7286).
 *
 * Le contrat serveur est celui de #7377 (`services/gateway/decisions.md`,
 * § « Le favori de message ») : `PUT`/`DELETE /me/starred-messages/:messageId`,
 * `GET /me/starred-messages` en keyset, et `message:starred` vers la seule room
 * du lecteur, SANS contenu.
 *
 * **LE FIL NE SERT AUCUN INDICATEUR D'ÉTOILE**, et c'est voulu : un booléen sur
 * `Message` rendrait commun à toute la conversation ce qui est personnel
 * (alternative rejetée par la décision serveur). L'état « en favori » d'un
 * message affiché vient donc de l'ENSEMBLE des ids que la liste sert —
 * exactement ce que #7379 prescrit à iOS (point 4) —, tenu à jour par le geste
 * et par l'écho. Cet ensemble est la caisse `membership`.
 *
 * **DEUX CAISSES, UN SEUL ÉCRIVAIN** : l'ensemble (qui répond « ce message
 * est-il en favori ? » dans le fil) et la liste (les lignes de l'écran
 * `/me/starred-messages`). Elles ne se déduisent pas l'une de l'autre — la
 * liste est paginée à l'écran, l'ensemble est complet ou inconnu —, mais
 * toutes deux ne sont écrites QUE par ce module et par le geste
 * (`starred-messages.ts`), qui l'appelle.
 *
 * **CE MODULE NE TIENT AUCUNE REQUÊTE** : il est atteint par le chunk
 * `realtime` (`socket.ts`), qui ne doit porter ni le code réseau du geste ni
 * le décodeur de l'écran.
 */

export const STARRED_MESSAGES_QUERY_ROOT = ['starred-messages'] as const;
export const STARRED_MEMBERSHIP_QUERY_KEY = ['starred-messages', 'membership'] as const;
export const STARRED_LIST_QUERY_KEY = ['starred-messages', 'list'] as const;

/** L'ensemble des messages en favori du lecteur : `messageId → starredAt` (ISO), tel que le serveur l'a servi. */
export type StarredMembership = Readonly<Record<string, string>>;

export type StarredPagination = {
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type StarredPage = { readonly items: readonly StarredMessageItem[]; readonly pagination: StarredPagination };

export type StarredListData = InfiniteData<StarredPage, string | undefined>;

/**
 * **CONNU OU INCONNU, JAMAIS DEVINÉ.** `undefined` tant que l'ensemble n'est
 * pas chargé : c'est ce qui retire l'entrée du menu plutôt que de proposer
 * « Ajouter » sur un message déjà en favori.
 */
export function starredStateOf(membership: StarredMembership | undefined, messageId: string): boolean | undefined {
  if (membership === undefined) return undefined;
  return Object.hasOwn(membership, messageId);
}

/**
 * POSER — sur un ensemble CONNU seulement. Un ensemble absent n'est jamais
 * fabriqué à partir d'une seule étoile : il serait partiel, donc faux pour
 * toutes les autres.
 */
export function withStar(
  membership: StarredMembership | undefined,
  messageId: string,
  starredAt: string,
): StarredMembership | undefined {
  if (membership === undefined || membership[messageId] === starredAt) return membership;
  return { ...membership, [messageId]: starredAt };
}

export function withoutStar(membership: StarredMembership | undefined, messageId: string): StarredMembership | undefined {
  if (membership === undefined || !Object.hasOwn(membership, messageId)) return membership;
  return Object.fromEntries(Object.entries(membership).filter(([id]) => id !== messageId));
}

/** La place d'une ligne dans la liste — relevée AVANT un retrait, pour que le retour arrière la rende à son rang. */
export type StarredRowSlot = { readonly item: StarredMessageItem; readonly page: number; readonly index: number };

export function starredRowSlotOf(data: StarredListData | undefined, messageId: string): StarredRowSlot | null {
  const pages = data?.pages ?? [];
  for (const [page, contenu] of pages.entries()) {
    const index = contenu.items.findIndex((row) => row.message.id === messageId);
    if (index !== -1) return { item: contenu.items[index] as StarredMessageItem, page, index };
  }
  return null;
}

/** La MÊME référence quand aucune page ne change — aucun rendu inutile, aucune caisse réécrite. */
const rebuilt = (data: StarredListData | undefined, pages: StarredPage[] | undefined): StarredListData | undefined => {
  if (data === undefined || pages === undefined) return data;
  return pages.every((page, i) => page === data.pages[i]) ? data : { ...data, pages };
};

/** RETIRER — la ligne part de TOUTES les pages : un curseur qui chevauche peut en servir deux copies. */
export function withoutStarredRow(data: StarredListData | undefined, messageId: string): StarredListData | undefined {
  if (data === undefined) return data;
  const pages = data.pages.map((page) =>
    page.items.some((row) => row.message.id === messageId)
      ? { ...page, items: page.items.filter((row) => row.message.id !== messageId) }
      : page,
  );
  return rebuilt(data, pages);
}

/**
 * REMETTRE — à sa place (retour arrière d'un retrait refusé). PAR LIGNE,
 * jamais par instantané de la liste : deux retraits concurrents
 * s'annuleraient l'un l'autre. Une page hors bornes (la liste a rétréci
 * pendant l'aller-retour) pose en tête plutôt que de perdre la ligne.
 */
export function withStarredRow(data: StarredListData | undefined, slot: StarredRowSlot): StarredListData | undefined {
  if (data === undefined || starredRowSlotOf(data, slot.item.message.id) !== null) return data;
  const connue = slot.page >= 0 && slot.page < data.pages.length;
  const cible = connue ? slot.page : 0;
  const rang = connue ? slot.index : 0;
  const pages = data.pages.map((page, i) => {
    if (i !== cible) return page;
    const index = Math.max(0, Math.min(rang, page.items.length));
    return { ...page, items: [...page.items.slice(0, index), slot.item, ...page.items.slice(index)] };
  });
  return rebuilt(data, pages);
}

/** `MessageStarredEventData` (`@meeshy/shared/types/socketio-events/message`), validée — jamais crue sur parole. */
type MessageStarredEvent =
  | { readonly messageId: string; readonly conversationId: string; readonly starred: true; readonly starredAt: string }
  | { readonly messageId: string; readonly conversationId: string; readonly starred: false; readonly starredAt: null };

function isMessageStarredEvent(payload: unknown): payload is MessageStarredEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.messageId !== 'string' || typeof p.conversationId !== 'string') return false;
  if (p.starred === true) return typeof p.starredAt === 'string';
  return p.starred === false;
}

/**
 * **`message:starred` — UN AUTRE APPAREIL, OU L'ÉCHO DE CE GESTE-CI.**
 *
 * Le favori est PERSONNEL : la passerelle n'émet que vers `user:<id>`, donc
 * tout écho reçu décrit le lecteur.
 *
 * - RETIRÉ : l'étoile s'éteint et la ligne quitte l'écran, sur-le-champ.
 * - POSÉ : l'étoile s'allume (la charge porte l'id et la date), et la liste
 *   est marquée PÉRIMÉE — la charge ne porte aucun contenu du message, par
 *   construction (règle 4 de la décision serveur) : la ligne se relit.
 *   `invalidateQueries` ne relit que si l'écran est monté.
 */
export function applyStarredEvent(queryClient: QueryClient, payload: unknown): void {
  if (!isMessageStarredEvent(payload)) return;
  const { messageId } = payload;
  if (payload.starred) {
    const { starredAt } = payload;
    writeCardCache<StarredMembership>(queryClient, STARRED_MEMBERSHIP_QUERY_KEY, (membership) =>
      withStar(membership, messageId, starredAt),
    );
    void queryClient.invalidateQueries({ queryKey: STARRED_LIST_QUERY_KEY });
    return;
  }
  writeCardCache<StarredMembership>(queryClient, STARRED_MEMBERSHIP_QUERY_KEY, (membership) => withoutStar(membership, messageId));
  writeCardCache<StarredListData>(queryClient, STARRED_LIST_QUERY_KEY, (data) => withoutStarredRow(data, messageId));
}
