import { randomBytes } from 'crypto';
import type { RankingSource } from '@meeshy/shared/types/social-events-v2';

/**
 * Le CONTEXTE DE LISTING qu'une page de fil sert (#10501) : un identifiant
 * opaque de page (`meta.feedRequestId`) et la source de classement de chaque
 * élément (`rankingSource`). L'impression qu'un client renvoie les recopie
 * dans `listing` : on saura plus tard à quelle page, à quel rang et par quel
 * classement un contenu a été montré (CTR par position, biais de position).
 *
 * L'identifiant est tiré au hasard et n'est gardé NULLE PART par la
 * passerelle : aucune correspondance page ↔ compte n'existe côté serveur
 * (revue de conformité O1). Additif : un ancien client n'en lit rien.
 */

export const newFeedRequestId = (): string => `fr_${randomBytes(12).toString('base64url')}`;

/** La source de classement de chaque scope de `GET /social/posts`. */
export const RANKING_SOURCE_OF_SCOPE = {
  home: 'for_you',
  reels: 'for_you',
  stories: 'following',
  'stories.mine': 'profile',
  statuses: 'following',
  author: 'profile',
  community: 'other',
  bookmarks: 'bookmarks',
  hashtag: 'hashtag',
  sound: 'sound',
  nearby: 'nearby',
} as const satisfies Record<string, RankingSource>;

export type RankedScope = keyof typeof RANKING_SOURCE_OF_SCOPE;

/** Chaque élément objet porte sa source de classement ; le reste passe tel quel. */
export const withRankingSource = (items: readonly unknown[], source: RankingSource): unknown[] =>
  items.map((item) =>
    typeof item === 'object' && item !== null && !Array.isArray(item) ? { ...item, rankingSource: source } : item);

/**
 * Une page de listing hors keyset (hashtag, son, lieu — #4346) et ses routes
 * historiques : mêmes données et même pagination qu'avant, chaque élément
 * avec sa source, la page avec son identifiant. UNE seule forme pour les six
 * adresses, pour que la parité scope ↔ route historique tienne clé à clé.
 */
export const rankedListingPage = <P>(
  page: { readonly data: readonly unknown[]; readonly pagination: P },
  scope: RankedScope,
): { data: unknown[]; pagination: P; meta: { feedRequestId: string } } => ({
  data: withRankingSource(page.data, RANKING_SOURCE_OF_SCOPE[scope]),
  pagination: page.pagination,
  meta: { feedRequestId: newFeedRequestId() },
});
