import type { QueryClient } from '@tanstack/react-query';

import { communityQueryKey, isoInstantOrNull, type CommunitySummary } from './communities';
import { communityJoinRequestsQueryKey } from './community-join-requests';

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null;

/**
 * `community:join-requested` (#19429) — posé sur la room personnelle des
 * administrateurs, des modérateurs et du créateur seulement. La charge ne
 * nomme le demandeur que par son identifiant : la liste se RELIT, et la
 * relecture repasse par les gardes de la passerelle (blocage, compte fermé).
 */
export function applyCommunityJoinRequestedEvent(queryClient: QueryClient, payload: unknown): void {
  const communityId = asRecord(payload)?.['communityId'];
  if (typeof communityId !== 'string' || communityId === '') return;
  void queryClient.invalidateQueries({ queryKey: communityJoinRequestsQueryKey(communityId), exact: true });
}

/**
 * `community:join-request-decided` (#19879) — posé sur la room du DEMANDEUR
 * seul quand un intendant refuse sa demande. Le détail en cache passe de
 * « Demande envoyée » à « Demande refusée — nouvelle demande possible le … » :
 * la charge dit déjà tout (la date), aucune relecture. Une communauté absente
 * du cache n'y est pas posée ; un rôle déjà servi (entré par une autre porte)
 * n'est pas touché.
 */
export function applyCommunityJoinRequestDecidedEvent(queryClient: QueryClient, payload: unknown): void {
  const event = asRecord(payload);
  const communityId = event?.['communityId'];
  if (typeof communityId !== 'string' || communityId === '' || event?.['decision'] !== 'rejected') return;
  const retryAt = typeof event['retryAt'] === 'string' ? isoInstantOrNull(event['retryAt']) : null;
  if (retryAt === null) return;
  const cached = queryClient.getQueryData<CommunitySummary>(communityQueryKey(communityId));
  if (cached === undefined) return;
  queryClient.setQueryData<CommunitySummary>(communityQueryKey(communityId), { ...cached, viewerJoinRequest: null, viewerJoinRetryAt: retryAt });
}
