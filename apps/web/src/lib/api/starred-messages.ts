import type { QueryClient } from '@tanstack/react-query';

import { writeCardCache } from './card-caches';
import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';
import {
  STARRED_LIST_QUERY_KEY,
  STARRED_MEMBERSHIP_QUERY_KEY,
  STARRED_MESSAGES_QUERY_ROOT,
  starredRowSlotOf,
  withStar,
  withStarredRow,
  withoutStar,
  withoutStarredRow,
  type StarredListData,
  type StarredMembership,
} from './starred-messages-cache';

/**
 * **LE PORT DES FAVORIS DE MESSAGES, CÔTÉ FIL** (#7378) — l'ensemble qui dit
 * si un message affiché est en favori, et le geste qui le change. Le contrat
 * est celui de #7377 (`services/gateway/decisions.md`, § « Le favori de
 * message ») ; les caisses et leurs lois vivent dans `starred-messages-cache.ts`.
 *
 * **POURQUOI PARCOURIR TOUTE LA LISTE.** Le fil ne sert aucun indicateur par
 * message (décision serveur : un booléen sur `Message` rendrait commun ce qui
 * est personnel). La seule source d'état est la liste
 * `GET /me/starred-messages` : l'ensemble se lit en la parcourant jusqu'au
 * bout, à la limite maximale, puis se tient à jour par le geste et par
 * `message:starred` — ce que #7379 prescrit à iOS (point 4). Il est
 * persisté avec le reste du cache (cache d'abord), et revalidé en fond.
 *
 * **UN ENSEMBLE PARTIEL N'EST JAMAIS RENDU** : une page en panne au milieu, ou
 * un curseur qui se répète, rend l'ÉCHEC. Un ensemble à moitié lu dirait « pas
 * en favori » pour tout ce qu'il n'a pas lu.
 *
 * **LE GESTE** suit la forme de `performPostGesture` (`feed-gestures.ts`) :
 * plan → optimiste → appel → issue.
 * - succès : l'optimiste reflète déjà la réalité ; la date servie remplace
 *   la date optimiste, et une pose marque la liste de l'écran périmée (la
 *   ligne se relit — le client ne fabrique jamais une ligne de favori, dont
 *   le serveur seul sait si elle est un placeholder) ;
 * - panne passagère (réseau, 5xx, 408/425/429 — `outcomeOf`) : l'optimiste
 *   RESTE, annoncé non confirmé. Aucune promesse de rejeu : la file de reprise
 *   est #5868, exactement comme pour un cœur ou une réaction ;
 * - refus (404, 403, 401…) : retour arrière — l'étoile, sa date, et la ligne À
 *   SA PLACE —, l'échec annoncé ; 409 `MESSAGE_NOT_STARRABLE` (vue unique) dit
 *   sa raison.
 *
 * UN GESTE À LA FOIS PAR MESSAGE — un second tap pendant l'aller-retour
 * croiserait un `DELETE` avec le `PUT` encore en route.
 */

export type StarredMessagesDeps = { readonly source: DataSource; readonly transport: HttpTransport };

/**
 * `STARRED_MESSAGES_MAX_LIMIT` du contrat (`@meeshy/shared/types/message-star`),
 * RECOPIÉ et non importé : ce module partagé construit ses schémas `zod` au
 * chargement, et l'importer ferait entrer `zod` entier dans le chunk du fil
 * pour une constante. Le témoin compare les deux.
 */
export const STARRED_MEMBERSHIP_PAGE_SIZE = 50;

/**
 * UN PLAFOND DE PAGES, pour qu'une passerelle qui ne dirait jamais « fin » ne
 * fasse pas tourner le parcours sans fin : 200 pages de 50, dix mille favoris.
 * Au-delà, l'état est INCONNU — l'entrée ne s'affiche pas, elle ne ment pas.
 */
const STARRED_MEMBERSHIP_MAX_PAGES = 200;

/** L'ensemble change par le geste et par l'écho ; la fenêtre ne couvre que ce qu'ils ne voient pas. */
export const STARRED_MEMBERSHIP_STALE_TIME = 5 * 60_000;

export const starredMessagesPath = (params: { readonly limit: number; readonly cursor?: string | undefined }): string => {
  const query = new URLSearchParams({ limit: String(params.limit) });
  if (params.cursor !== undefined) query.set('cursor', params.cursor);
  return `/api/v1/me/starred-messages?${query.toString()}`;
};

/** La pagination keyset du contrat — `{ limit, hasMore, nextCursor, form: 'keyset' }`. */
export function starredPaginationOf(raw: unknown, fallbackLimit: number) {
  const wire = (raw ?? {}) as { readonly limit?: unknown; readonly hasMore?: unknown; readonly nextCursor?: unknown };
  const nextCursor = typeof wire.nextCursor === 'string' && wire.nextCursor !== '' ? wire.nextCursor : null;
  return {
    limit: typeof wire.limit === 'number' ? wire.limit : fallbackLimit,
    hasMore: wire.hasMore === true && nextCursor !== null,
    nextCursor,
  };
}

/** De chaque ligne, l'id du message et la date de l'étoile — rien d'autre n'est lu pour l'ensemble. */
const membershipOfRows = (data: unknown): StarredMembership =>
  Object.fromEntries(
    (Array.isArray(data) ? data : []).flatMap((raw: unknown) => {
      const line = raw as { readonly starredAt?: unknown; readonly message?: { readonly id?: unknown } } | null;
      const id = line?.message?.id;
      const starredAt = line?.starredAt;
      return typeof id === 'string' && typeof starredAt === 'string' ? [[id, starredAt] as const] : [];
    }),
  );

const WALK_FAILED = (error: string): ApiResult<StarredMembership> => ({ ok: false, status: 0, error });

async function walk(
  params: StarredMessagesDeps & { readonly signal?: AbortSignal },
  state: { readonly cursor: string | undefined; readonly seen: StarredMembership; readonly pagesLeft: number },
): Promise<ApiResult<StarredMembership>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: starredMessagesPath({ limit: STARRED_MEMBERSHIP_PAGE_SIZE, cursor: state.cursor }),
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const seen = { ...state.seen, ...membershipOfRows(result.data) };
  const { hasMore, nextCursor } = starredPaginationOf(result.pagination, STARRED_MEMBERSHIP_PAGE_SIZE);
  if (!hasMore || nextCursor === null) return { ok: true, data: seen };
  if (nextCursor === state.cursor) return WALK_FAILED('STARRED_CURSOR_REPEATED');
  if (state.pagesLeft <= 1) return WALK_FAILED('STARRED_WALK_CAPPED');
  return walk(params, { cursor: nextCursor, seen, pagesLeft: state.pagesLeft - 1 });
}

export async function loadStarredMembership(
  params: StarredMessagesDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<StarredMembership>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureStarredMembership } = await import('./fixtures-starred');
    return { ok: true, data: fixtureStarredMembership() };
  }
  return walk(params, { cursor: undefined, seen: {}, pagesLeft: STARRED_MEMBERSHIP_MAX_PAGES });
}

export function starredMembershipQueryOptions(deps: StarredMessagesDeps) {
  return {
    queryKey: STARRED_MEMBERSHIP_QUERY_KEY,
    staleTime: STARRED_MEMBERSHIP_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadStarredMembership({ ...deps, ...(signal !== undefined ? { signal } : {}) })),
  };
}

export type StarGestureDeps = StarredMessagesDeps & { readonly queryClient: QueryClient };

/**
 * Des CLÉS DE CATALOGUE, jamais un texte traduit : cette couche n'a pas la
 * langue d'interface, l'hôte qui annonce l'a (même patron que
 * `PostGestureMessageKey`).
 */
export type StarGestureMessageKey =
  | 'announce.messageStarred'
  | 'announce.messageUnstarred'
  | 'starred.messages.pending'
  | 'starred.messages.error'
  | 'starred.messages.notStarrable';

/** `message` absent ⇒ geste ignoré (un autre est en vol sur ce message) : rien à annoncer. */
export type StarGestureResult =
  | { readonly ok: true; readonly message?: StarGestureMessageKey }
  | { readonly ok: false; readonly message: StarGestureMessageKey };

export type StarTarget = { readonly id: string; readonly conversationId: string };

const NOT_STARRABLE_CODE = 'MESSAGE_NOT_STARRABLE';

const inFlight = new Set<string>();

function sendStar(deps: StarGestureDeps, message: StarTarget, on: boolean): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return import('./fixtures-starred').then(({ recordFixtureStar }) => recordFixtureStar(message, on));
  }
  return deps.transport.request<unknown>({
    method: on ? 'PUT' : 'DELETE',
    path: `/api/v1/me/starred-messages/${encodeURIComponent(message.id)}`,
  });
}

const servedStarredAt = (data: unknown): string | undefined => {
  const starredAt = (data as { readonly starredAt?: unknown } | null)?.starredAt;
  return typeof starredAt === 'string' && starredAt !== '' ? starredAt : undefined;
};

export async function performStarGesture(params: {
  readonly message: StarTarget;
  /** L'ÉTAT VOULU, dit par l'appelant qui l'a vu — jamais déduit ici d'une caisse qui peut être absente. */
  readonly on: boolean;
  readonly deps: StarGestureDeps;
}): Promise<StarGestureResult> {
  const { message, on, deps } = params;
  const { queryClient } = deps;
  if (inFlight.has(message.id)) return { ok: true };
  inFlight.add(message.id);
  try {
    /* UNE RELECTURE EN VOL rendrait l'état d'AVANT le geste par-dessus
       l'optimiste : on l'annule d'abord (motif optimiste de TanStack). */
    await queryClient.cancelQueries({ queryKey: STARRED_MESSAGES_QUERY_ROOT });

    const before = queryClient.getQueryData<StarredMembership>(STARRED_MEMBERSHIP_QUERY_KEY)?.[message.id];
    /* LA PLACE DE LA LIGNE, relevée AVANT l'optimiste : après, elle n'y est plus. */
    const slot = starredRowSlotOf(queryClient.getQueryData<StarredListData>(STARRED_LIST_QUERY_KEY), message.id);
    const optimisticAt = new Date().toISOString();

    const setOn = (value: boolean, starredAt: string) => {
      writeCardCache<StarredMembership>(queryClient, STARRED_MEMBERSHIP_QUERY_KEY, (membership) =>
        value ? withStar(membership, message.id, starredAt) : withoutStar(membership, message.id),
      );
      writeCardCache<StarredListData>(queryClient, STARRED_LIST_QUERY_KEY, (data) => {
        if (!value) return withoutStarredRow(data, message.id);
        return slot === null ? data : withStarredRow(data, slot);
      });
    };

    setOn(on, optimisticAt);
    const result = await sendStar(deps, message, on).catch(() => null);
    if (result === null) return { ok: true, message: 'starred.messages.pending' };

    if (result.ok) {
      const served = on ? servedStarredAt(result.data) : undefined;
      if (served !== undefined) setOn(true, served);
      if (on) void queryClient.invalidateQueries({ queryKey: STARRED_LIST_QUERY_KEY });
      return { ok: true, message: on ? 'announce.messageStarred' : 'announce.messageUnstarred' };
    }

    if (outcomeOf(result) !== 'permanent') return { ok: true, message: 'starred.messages.pending' };

    setOn(!on, before ?? optimisticAt);
    return { ok: false, message: result.code === NOT_STARRABLE_CODE ? 'starred.messages.notStarrable' : 'starred.messages.error' };
  } finally {
    inFlight.delete(message.id);
  }
}
