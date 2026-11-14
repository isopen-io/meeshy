import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '../net/socket';
import { COMMUNITIES_QUERY_PREFIX, communityQueryKey, decodeCommunity, type CommunityPage, type CommunitySummary } from './communities';

/**
 * **L'IDENTITÉ D'UNE COMMUNAUTÉ SUIT SES RÉGLAGES** (#18435) —
 * `community:updated`, posé par la passerelle sur la room personnelle de
 * chaque membre actif et du créateur après `PUT /communities/:id` (et la
 * bascule de confidentialité de l'administration).
 *
 * Le détail et la liste vivent en cache avec une péremption de cinq minutes
 * (`COMMUNITIES_STALE_TIME`) : un renommage fait par le créateur restait
 * invisible chez les autres membres jusque-là. L'événement est APPLIQUÉ au
 * cache, jamais traduit en invalidation — la charge dit déjà tout, et une
 * relance ferait clignoter l'écran regardé (choix de `applyStickerLibraryEvent`).
 *
 * Seule l'IDENTITÉ change : le rôle du lecteur, l'agrégat « N en ligne », le
 * créateur et le nombre de salons restent ceux que le cache tenait. Une
 * communauté absente du cache n'y est pas posée depuis un événement.
 */

type IdentityPatch = Pick<CommunitySummary, 'identifier' | 'name' | 'description' | 'avatar' | 'banner' | 'isPrivate' | 'memberCount'>;

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null;

/** Le décodeur de la réponse HTTP, pour que le nom échappé (#16786) se rende par le MÊME chemin. */
function decodeUpdate(payload: unknown): { readonly communityId: string; readonly patch: IdentityPatch } | null {
  const event = asRecord(payload);
  if (event === null || typeof event['communityId'] !== 'string') return null;
  const decoded = decodeCommunity({ ...event, id: event['communityId'] });
  if (decoded === null || typeof event['isPrivate'] !== 'boolean' || typeof event['memberCount'] !== 'number') return null;
  const { identifier, name, description, avatar, banner, isPrivate, memberCount } = decoded;
  return { communityId: decoded.id, patch: { identifier, name, description, avatar, banner, isPrivate, memberCount } };
}

const patchPage = (page: CommunityPage, communityId: string, patch: IdentityPatch): CommunityPage =>
  page.communities.some((community) => community.id === communityId)
    ? { ...page, communities: page.communities.map((community) => (community.id === communityId ? { ...community, ...patch } : community)) }
    : page;

const isCommunityList = (data: unknown): data is InfiniteData<CommunityPage, number> => {
  const record = asRecord(data);
  return record !== null && Array.isArray(record['pages']);
};

export function applyCommunityUpdatedEvent(queryClient: QueryClient, payload: unknown): void {
  const update = decodeUpdate(payload);
  if (update === null) return;
  const { communityId, patch } = update;

  const detail = queryClient.getQueryData<CommunitySummary>(communityQueryKey(communityId));
  if (detail !== undefined) queryClient.setQueryData<CommunitySummary>(communityQueryKey(communityId), { ...detail, ...patch });

  queryClient
    .getQueriesData<InfiniteData<CommunityPage, number>>({ queryKey: [COMMUNITIES_QUERY_PREFIX[0], 'list'] })
    .forEach(([queryKey, list]) => {
      if (!isCommunityList(list)) return;
      const pages = list.pages.map((page) => patchPage(page, communityId, patch));
      if (pages.every((page, index) => page === list.pages[index])) return;
      queryClient.setQueryData<InfiniteData<CommunityPage, number>>(queryKey, { ...list, pages });
    });
}

/** Branche l'événement sur les caches des communautés ; rend le débranchement. */
export function bindCommunityLive(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const { socket, queryClient } = params;
  const onUpdated = (payload: unknown): void => applyCommunityUpdatedEvent(queryClient, payload);
  socket.on(SERVER_EVENTS.COMMUNITY_UPDATED, onUpdated);
  return () => socket.off(SERVER_EVENTS.COMMUNITY_UPDATED, onUpdated);
}
