import type { QueryClient } from '@tanstack/react-query';

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
