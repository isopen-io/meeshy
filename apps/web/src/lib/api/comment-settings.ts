import type { QueryClient } from '@tanstack/react-query';
import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';

import { commentsClosed } from '@/lib/feed/comments-closed';

import { findCardPost, updateCardPost, writeCardCache } from './card-caches';
import type { ApiResult } from './http';
import { outcomeOf } from './outcome';
import type { PostActionDeps } from './publication-actions';
import { STORY_FEED_QUERY_KEY, storyPostQueryKey, type StoryFeedPost } from './stories';

/**
 * **FERMER OU ROUVRIR LES COMMENTAIRES D'UNE PUBLICATION** (#16541) — le port
 * `PATCH posts.byPostIdCommentSettings` et la SEULE écriture de
 * `commentsDisabled` dans les caisses du client.
 *
 * Une publication vit dans DEUX familles de caisses : les cartes (Flux,
 * Réels, enregistrées, hashtag, profil, fiche — `card-caches.ts`) et les
 * stories (corpus du lecteur, fiche unitaire — tableaux plats). Le réglage
 * doit atteindre les deux, et le fil GELÉ des Réels aussi : ce n'est pas un
 * contenu neuf, c'est ce que la barre de commentaires a le droit d'offrir.
 */
const storyOf = (queryClient: QueryClient, postId: string): StoryFeedPost | undefined =>
  queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((story) => story.id === postId) ??
  queryClient.getQueryData<StoryFeedPost>(storyPostQueryKey(postId));

/** Les commentaires de cette publication sont-ils fermés, d'après ce que le client en sait ? */
export function readCommentsClosed(queryClient: QueryClient, postId: string): boolean {
  return commentsClosed(findCardPost(queryClient, postId) ?? storyOf(queryClient, postId));
}

/** Le réglage PROPRE de la publication — jamais celui de l'original qu'elle republie : c'est lui que le menu bascule. */
export const ownSetting = (queryClient: QueryClient, postId: string): boolean =>
  (findCardPost(queryClient, postId) ?? storyOf(queryClient, postId))?.commentsDisabled === true;

export function writeCommentsDisabled(queryClient: QueryClient, postId: string, disabled: boolean): void {
  updateCardPost(queryClient, postId, (post) => (post.commentsDisabled === disabled ? post : { ...post, commentsDisabled: disabled }));
  const apply = <T extends { readonly id: string; readonly commentsDisabled?: boolean | null }>(story: T): T =>
    story.id === postId && story.commentsDisabled !== disabled ? { ...story, commentsDisabled: disabled } : story;
  writeCardCache<readonly StoryFeedPost[]>(queryClient, STORY_FEED_QUERY_KEY, (stories) => {
    if (stories === undefined || !stories.some((story) => story.id === postId && story.commentsDisabled !== disabled)) return stories;
    return stories.map(apply);
  });
  writeCardCache<StoryFeedPost>(queryClient, storyPostQueryKey(postId), (story) => (story === undefined ? story : apply(story)));
}

/**
 * **UNE PUBLICATION DIFFUSÉE PORTE SON RÉGLAGE** (`post:updated`,
 * `story:updated`, `status:updated`) — posé partout, Réels gelés compris. Un
 * champ absent (serveur ancien) ne décide rien.
 */
export function applyServedCommentSetting(queryClient: QueryClient, post: unknown): void {
  if (typeof post !== 'object' || post === null) return;
  const { id, commentsDisabled } = post as { readonly id?: unknown; readonly commentsDisabled?: unknown };
  if (typeof id !== 'string' || typeof commentsDisabled !== 'boolean') return;
  writeCommentsDisabled(queryClient, id, commentsDisabled);
}

/** `forbidden` : ni l'auteur, ni une modération qui le dépasse (403). */
export type CommentSettingOutcome = 'done' | 'offline' | 'forbidden' | 'failed';

const outcomeOfResult = (result: ApiResult<unknown> | null): CommentSettingOutcome => {
  if (result === null) return 'offline';
  if (result.ok) return 'done';
  if (result.status === 403) return 'forbidden';
  return outcomeOf(result) === 'permanent' ? 'failed' : 'offline';
};

const servedSetting = (data: unknown): boolean | undefined => {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as { readonly commentsDisabled?: unknown }).commentsDisabled;
  return typeof value === 'boolean' ? value : undefined;
};

/**
 * OPTIMISTE — capture, pose, envoie, rend l'état d'avant sur tout échec : la
 * barre de commentaires se cache (ou revient) au tap, la passerelle confirme.
 */
export async function setCommentsDisabled(params: {
  readonly postId: string;
  readonly disabled: boolean;
  readonly deps: PostActionDeps;
}): Promise<CommentSettingOutcome> {
  const { postId, disabled, deps } = params;
  const before = ownSetting(deps.queryClient, postId);
  writeCommentsDisabled(deps.queryClient, postId, disabled);

  const result: ApiResult<unknown> | null =
    __FIXTURES__ && deps.source === 'fixtures'
      ? { ok: true, data: { postId, commentsDisabled: disabled } }
      : await deps.transport
          .request<unknown>({ method: 'PATCH', path: postsEndpoints.byPostIdCommentSettings(postId), body: { commentsDisabled: disabled } })
          .catch(() => null);

  const outcome = outcomeOfResult(result);
  if (outcome !== 'done') {
    writeCommentsDisabled(deps.queryClient, postId, before);
    return outcome;
  }
  const served = result !== null && result.ok ? servedSetting(result.data) : undefined;
  if (served !== undefined && served !== disabled) writeCommentsDisabled(deps.queryClient, postId, served);
  return outcome;
}
