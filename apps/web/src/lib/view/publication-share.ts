import { findCardPost } from '@/lib/api/card-caches';
import type { FeedPost } from '@/lib/api/feed-pages';
import { recordShareAction } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import { publicationShareUrl } from '@/lib/feed/share-url';
import type { PublishFormat, SendPreview } from '@/lib/send/send-sheet-plan';
import { openSendSheet, type SendSheetRequest } from '@/lib/send/send-sheet-store';

const postTypeOf = (post: FeedPost | undefined): PublishFormat => (post?.type === 'REEL' || post?.type === 'STORY' ? post.type : 'POST');

const thumbOf = (post: FeedPost | undefined): string | undefined => {
  const first = post?.media?.[0];
  if (first === undefined || first === null) return undefined;
  if (typeof first.thumbnailUrl === 'string' && first.thumbnailUrl !== '') return first.thumbnailUrl;
  return first.mimeType?.startsWith('image/') === true ? first.fileUrl : undefined;
};

const previewOf = (post: FeedPost | undefined): SendPreview => {
  const text = post?.content?.trim();
  const thumbUrl = thumbOf(post);
  return {
    kind: 'publication',
    ...(text === undefined || text === '' ? {} : { text }),
    ...(thumbUrl === undefined ? {} : { thumbUrl }),
  };
};

/**
 * **« PARTAGER » UNE PUBLICATION OUVRE LA FEUILLE D'ENVOI** (#8884, directive
 * porteur 2026-09-30) — la même base que le transfert d'un message : envoyer
 * la publication à une personne, à plusieurs, à un groupe, ou la republier en
 * post, story ou réel, avec un message joint. Le partage SYSTÈME
 * (`partagerLien`, D-48) n'a pas disparu : il est derrière « Plus
 * d'options… », que la feuille ouvre avec l'adresse canonique. Le partage est
 * COMPTÉ (`POST /posts/:id/share`) par `onShared`, une fois qu'il est parti.
 *
 * La carte vient du registre des caisses (`findCardPost`) : le fil, le détail,
 * les signets, un hashtag ou les Réels l'ont déjà peinte, donc l'entrée n'a
 * que l'identifiant à donner. Un lien direct n'a rien dans aucune caisse : la
 * feuille s'ouvre quand même, en POST et sans aperçu — rien n'est inventé.
 *
 * Synchrone et sans réseau : ouvrir la feuille est le geste, pas une requête.
 */
export function openPublicationShare(params: {
  readonly postId: string;
  readonly lookup?: (postId: string) => FeedPost | undefined;
  readonly open?: (request: SendSheetRequest) => void;
  readonly record?: (postId: string) => unknown;
}): void {
  const { postId } = params;
  const record = params.record ?? recordShareAction;
  const post = (params.lookup ?? ((id: string) => findCardPost(appQueryClient, id)))(postId);
  const url = publicationShareUrl(postId);
  (params.open ?? openSendSheet)({
    intent: 'share',
    payload: { kind: 'publication', postId, postType: postTypeOf(post), url, preview: previewOf(post) },
    moreOptions: { url },
    onShared: () => void record(postId),
  });
}
