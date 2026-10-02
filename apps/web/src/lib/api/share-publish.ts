import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';
import type { PostVisibility } from '@meeshy/shared/types/post';

import { newClientMessageId } from './client-message-id';
import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * LES PORTS DE L'ENVOI VERS UNE PUBLICATION (#8884) — ce que la feuille
 * d'envoi (`lib/send/send-sheet-*`) appelle quand la cible n'est pas une
 * conversation mais un POST, une STORY ou un RÉEL. Trois routes, trois corps ;
 * aucune règle ici (la feuille décide QUOI publier et SOUS QUEL format, la
 * passerelle refuse un média protégé).
 *
 * **Une légende vide ne part JAMAIS** — la clé `content` est absente plutôt
 * que `''` (même discipline que `SendMessageBody`, `api/messages.ts`).
 */
export type PublishFormat = 'POST' | 'STORY' | 'REEL';

export type PublishedPost = { readonly id: string };

const captionOf = (content: string | undefined): { readonly content?: string } => {
  const trimmed = content?.trim() ?? '';
  return trimmed === '' ? {} : { content: trimmed };
};

const fixtureOutcome = (prefix: string): ApiResult<PublishedPost> => ({
  ok: true,
  data: { id: `${prefix}-${newClientMessageId()}` },
});

const publishedOf = (result: ApiResult<unknown>): ApiResult<PublishedPost> => {
  if (!result.ok) return result;
  const data = result.data;
  const id = typeof data === 'object' && data !== null && 'id' in data ? (data as { readonly id: unknown }).id : undefined;
  return { ...result, data: { id: typeof id === 'string' ? id : '' } };
};

/**
 * `POST posts.fromAttachment` (`routes/posts/core.ts:219`) — publie la pièce
 * d'un message SANS la retélécharger : le serveur DUPLIQUE le fichier. Refuse
 * un média protégé (vue unique, flouté, éphémère, chiffré) en 400
 * `PROTECTED_MEDIA`.
 */
export async function publishFromAttachment(
  params: ConversationsDeps & {
    readonly attachmentId: string;
    readonly target: PublishFormat;
    readonly content?: string;
    readonly visibility?: PostVisibility;
  },
): Promise<ApiResult<PublishedPost>> {
  if (__FIXTURES__ && params.source === 'fixtures') return fixtureOutcome('fx-attachment-post');
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: postsEndpoints.fromAttachment,
    body: {
      attachmentId: params.attachmentId,
      target: params.target,
      ...captionOf(params.content),
      ...(params.visibility === undefined ? {} : { visibility: params.visibility }),
    },
  });
  return publishedOf(result);
}

/**
 * `POST posts.byPostIdRepost` AVEC son format et sa légende
 * (`RepostSchema`, `routes/posts/types.ts:494`). `performRepost`
 * (`publication-repost.ts`) reste le geste du rail — optimiste, sans légende ;
 * ce port-ci sert la feuille, où l'on CHOISIT le format et où l'on peut
 * ajouter un mot. `isQuote` est porté par l'appelant : une légende fait une
 * citation, pas un repost muet.
 */
export async function repostWithCaption(
  params: ConversationsDeps & {
    readonly postId: string;
    readonly targetType?: PublishFormat;
    readonly content?: string;
    readonly isQuote: boolean;
    readonly visibility?: PostVisibility;
  },
): Promise<ApiResult<PublishedPost>> {
  if (__FIXTURES__ && params.source === 'fixtures') return fixtureOutcome('fx-repost');
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: postsEndpoints.byPostIdRepost(params.postId),
    body: {
      ...(params.targetType === undefined ? {} : { targetType: params.targetType }),
      ...captionOf(params.content),
      isQuote: params.isQuote,
      ...(params.visibility === undefined ? {} : { visibility: params.visibility }),
    },
    headers: { 'X-Client-Mutation-Id': newClientMessageId().replace(/^cid_/, 'cmid_') },
  });
  return publishedOf(result);
}

/** `POST posts.root` pour un post SANS média — le texte partagé (lien, extrait). */
export async function createTextPost(
  params: ConversationsDeps & {
    readonly type: PublishFormat;
    readonly content: string;
    readonly visibility?: PostVisibility;
  },
): Promise<ApiResult<PublishedPost>> {
  if (__FIXTURES__ && params.source === 'fixtures') return fixtureOutcome('fx-text-post');
  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: postsEndpoints.root,
    body: {
      type: params.type,
      content: params.content,
      ...(params.visibility === undefined ? {} : { visibility: params.visibility }),
    },
  });
  return publishedOf(result);
}
