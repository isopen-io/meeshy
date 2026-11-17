import type { QueryClient } from '@tanstack/react-query';

import type { ContentPathTarget } from '@meeshy/shared/utils/content-link';

import { contentOfTrackingResolution } from '@/lib/links/content-link';

import { cachedCardSeed } from './card-caches';
import { ApiError, unwrap } from './client';
import type { DataSource } from './config';
import type { FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { postQueryOptions } from './publication-detail';
import { resolveTrackingLink } from './tracking-links';

/**
 * **LE PORT DE LA CARTE D'UN CONTENU** (#19334, parapluie #19331) — ce qu'une
 * bulle ou une publication lit pour déplier un lien Meeshy vers une
 * publication, un réel, une story ou une humeur.
 *
 * - la PUBLICATION est la fiche existante (`GET posts.byPostId`, la même clé
 *   `['posts', id]` que le détail) : lue sous l'audience du lecteur, elle
 *   s'amorce de toute carte déjà peinte ailleurs (`cachedCardSeed` : le fil, les
 *   réels, les enregistrées…), fraîche une minute — le régime de la carte de
 *   conversation (#8099) —, gardée un jour par le cache de l'application ; et
 *   chaque cœur ou favori posé ailleurs l'atteint par le registre des caisses ;
 * - un LIEN SUIVI `/l/<jeton>` se résout par la route publique
 *   (`resolveTrackingLink`, celle de la page `/l/:token`) et se mémorise : un
 *   jeton ne change jamais de cible, sa résolution ne se relit pas.
 *
 * **Le refus n'est pas une panne.** La passerelle rend le même 404 pour une
 * publication supprimée, expirée, hors audience ou inconnue (D-6) : la carte
 * le dit « indisponible », sans « Réessayer » sur une porte fermée. Une panne
 * sans rien de connu laisse le lien tel qu'il est écrit — jamais un trou.
 */

export type ContentCardDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const CONTENT_CARD_STALE_TIME = 60_000;

export const CONTENT_LINK_TARGETS_QUERY_PREFIX = ['content-link-targets'] as const;

export const contentLinkTargetQueryKey = (token: string) => [...CONTENT_LINK_TARGETS_QUERY_PREFIX, token] as const;

/** Les refus qui répondent sur le LIEN : il est mort, il ne désigne rien. */
const DEAD_LINK_STATUSES: ReadonlySet<number> = new Set([400, 404, 410]);

/** Les refus qui répondent sur la PUBLICATION : elle n'est plus lisible par ce lecteur. */
const REFUSED_STATUSES: ReadonlySet<number> = new Set([403, 404, 410]);

export async function loadContentLinkTarget(params: ContentCardDeps & { readonly token: string }): Promise<ApiResult<ContentPathTarget | null>> {
  const result = await resolveTrackingLink(params, params.token);
  if (!result.ok) return DEAD_LINK_STATUSES.has(result.status) ? { ok: true, data: null } : result;
  return { ok: true, data: contentOfTrackingResolution(result.data) };
}

export function contentLinkTargetQueryOptions(deps: ContentCardDeps, token: string) {
  return {
    queryKey: contentLinkTargetQueryKey(token),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () => unwrap(await loadContentLinkTarget({ ...deps, token })),
  };
}

export function contentPostQueryOptions(params: ContentCardDeps & { readonly postId: string; readonly queryClient: QueryClient }) {
  return {
    ...postQueryOptions({ source: params.source, transport: params.transport, postId: params.postId }),
    ...cachedCardSeed(params.queryClient, params.postId),
    staleTime: CONTENT_CARD_STALE_TIME,
    retry: false,
  };
}

export type ContentPostState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'card'; readonly post: FeedPost }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' };

const isRefused = (error: unknown): boolean => error instanceof ApiError && REFUSED_STATUSES.has(error.status);

const hasFailed = (error: unknown): boolean => error !== null && error !== undefined;

/**
 * L'ÉTAT DE LA CARTE, lu sur sa requête. Le refus gagne sur une carte connue :
 * la publication est partie, la montrer encore mentirait. Une panne, elle, ne
 * retire rien de ce qu'on sait déjà.
 */
export function contentPostStateOf(query: { readonly data: FeedPost | undefined; readonly error: unknown }): ContentPostState {
  if (isRefused(query.error)) return { kind: 'unavailable' };
  if (query.data !== undefined) return { kind: 'card', post: query.data };
  return hasFailed(query.error) ? { kind: 'failed' } : { kind: 'loading' };
}

export type ContentTargetState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'content'; readonly target: ContentPathTarget }
  | { readonly kind: 'none' }
  | { readonly kind: 'failed' };

/**
 * L'ÉTAT D'UN LIEN SUIVI avant sa carte : `none` passe la main au lien de
 * contenu suivant du texte. `excludePostId` : une publication ne se cite pas
 * elle-même, pas plus par un lien suivi que par son adresse.
 */
export function contentTargetStateOf(
  query: { readonly data: ContentPathTarget | null | undefined; readonly error: unknown },
  excludePostId?: string,
): ContentTargetState {
  if (query.data === null) return { kind: 'none' };
  if (query.data !== undefined) return query.data.postId === excludePostId ? { kind: 'none' } : { kind: 'content', target: query.data };
  return hasFailed(query.error) ? { kind: 'failed' } : { kind: 'loading' };
}
