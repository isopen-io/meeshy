import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';

import type { StudioPostUpdateBody } from '@/lib/stories/studio-edit-plan';

import { findCardPost, findLiveCardPost, mergeServedPost, replaceCardContent } from './card-caches';
import { CANVAS_CAPS_HEADERS, type FeedPost } from './feed-pages';
import type { ApiResult } from './http';
import type { PostActionDeps } from './publication-actions';

/**
 * **ENREGISTRER UNE PUBLICATION ROUVERTE DANS LE STUDIO** (#9317) — le port
 * `PUT posts.byPostId` (`services/gateway/src/routes/posts/core.ts`,
 * `UpdatePostSchema`) pour le document ENTIER, là où `editPost`
 * (`publication-actions.ts`) ne porte que le texte. Le corps vient d'UNE loi
 * pure (`studioEditSavePlan`), jamais composé ici. `CANVAS_CAPS_HEADERS` part
 * comme sur la création (`stories-publish.ts`) : la réponse sert le canvas.
 *
 * **OPTIMISTE, comme `editPost`** : chaque caisse VIVANTE qui montre la carte
 * (`replaceCardContent`, jamais le fil gelé des Réels — D-66) reçoit le
 * nouveau document avant la réponse ; un corps changé y efface ses
 * traductions, qui décrivaient l'ANCIEN texte. La publication SERVIE s'y pose
 * ensuite (`mergeServedPost` garde l'état du lecteur) ; un refus rend
 * EXACTEMENT le document, le corps et les traductions lus au départ — rien
 * d'autre, un cœur posé entre-temps survit.
 *
 * Une story n'est dans aucune caisse de cartes : l'appelant relit ses
 * plateaux (`STORIES_QUERY_PREFIX`) une fois l'enregistrement fait.
 */
type EditedFields = Pick<FeedPost, 'storyEffects' | 'content' | 'translations'>;

const editedFieldsOf = (post: FeedPost): EditedFields => ({
  ...(post.storyEffects !== undefined ? { storyEffects: post.storyEffects } : {}),
  ...(post.content !== undefined ? { content: post.content } : {}),
  ...(post.translations !== undefined ? { translations: post.translations } : {}),
});

/** `post` sans ses champs édités, puis ceux de `fields` — une clé absente de
 * `fields` redevient absente (`exactOptionalPropertyTypes`). */
const withEditedFields = (post: FeedPost, fields: EditedFields): FeedPost => {
  const { storyEffects: _effects, content: _content, translations: _translations, ...rest } = post;
  return { ...rest, ...fields };
};

const optimisticOf = (post: FeedPost, body: StudioPostUpdateBody): FeedPost =>
  withEditedFields(post, {
    ...editedFieldsOf(post),
    storyEffects: body.storyEffects,
    ...(body.content !== undefined ? { content: body.content, translations: {} } : {}),
  });

const isServedPost = (value: unknown): value is FeedPost =>
  typeof value === 'object' && value !== null && typeof (value as { readonly id?: unknown }).id === 'string';

export async function updatePublication(params: {
  readonly postId: string;
  readonly body: StudioPostUpdateBody;
  readonly deps: PostActionDeps;
  readonly signal?: AbortSignal;
}): Promise<ApiResult<FeedPost>> {
  const { postId, body, deps } = params;
  const held = findLiveCardPost(deps.queryClient, postId) ?? findCardPost(deps.queryClient, postId);
  if (held !== undefined) replaceCardContent(deps.queryClient, postId, (post) => optimisticOf(post, body));

  const result: ApiResult<FeedPost> =
    __FIXTURES__ && deps.source === 'fixtures'
      ? { ok: true, data: optimisticOf(held ?? { id: postId, type: 'POST', createdAt: new Date().toISOString() }, body) }
      : await deps.transport
          .request<FeedPost>({
            method: 'PUT',
            path: postsEndpoints.byPostId(postId),
            headers: CANVAS_CAPS_HEADERS,
            body,
            ...(params.signal !== undefined ? { signal: params.signal } : {}),
          })
          .catch((): ApiResult<FeedPost> => ({ ok: false, status: 0, error: 'network', code: 'NETWORK' }));

  if (result.ok) {
    const served = result.data;
    if (isServedPost(served)) replaceCardContent(deps.queryClient, postId, (post) => mergeServedPost(served, post));
    return result;
  }
  if (held !== undefined) {
    const before = editedFieldsOf(held);
    replaceCardContent(deps.queryClient, postId, (post) => withEditedFields(post, before));
  }
  return result;
}
