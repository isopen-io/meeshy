import type { FeedMedia, FeedPost } from '@/lib/api/feed-pages';
import type { StoryTrayPost } from '@/lib/api/stories';
import type { ContentCardVisual } from '@/lib/feed/content-card';
import { storyMediaUrl } from '@/lib/stories/playback';
import { planSend, type SendPlanResult } from '@/lib/send/send-sheet-plan';
import type { TargetStatus } from '@/lib/send/send-sheet-run';
import { publicationPayloadOf } from '@/lib/view/publication-payload';

/**
 * **« LUI ENVOYER UN CONTENU », DEPUIS LA FICHE D'UN PROCHE** (#20245, jumelle web de #19628 et #20243 ;
 * référence `ProfileSendContent.swift`) — mes publications, mes réels et mes stories en grille de trois
 * cartes ; un toucher choisit, « Envoyer à X » part vers NOTRE conversation directe.
 *
 * **La porte est le verdict servi** : `sendContentOffered` (`relation-face.ts`, pour que la fiche ne charge
 * pas le moteur d'envoi avant le premier toucher).
 *
 * **L'envoi n'écrit aucune règle** : il est un `planSend` ordinaire (`open-direct` puis le lien), joué par
 * la file d'envoi durable. La conversation directe se retrouve ou se crée à l'envoi, et une conversation
 * vue chiffrée de bout en bout ne reçoit rien en clair (`send-sheet-run.ts`, #12949) : fail-closed.
 */

export const SEND_CONTENT_KINDS = ['publication', 'reel', 'story'] as const;
export type SendContentKind = (typeof SEND_CONTENT_KINDS)[number];

export const SEND_CONTENT_COLUMNS = 3;

const SCENE_RATIO = 9 / 16;
const PUBLICATION_RATIO = 4 / 5;

/** Une publication se tient en 4:5 ; un réel et une story dans le portrait de la scène. */
export const sendContentCardRatio = (kind: SendContentKind): number => (kind === 'publication' ? PUBLICATION_RATIO : SCENE_RATIO);

/** Une story du plateau, dans la forme d'un contenu : ce que la carte peint et ce que l'envoi désigne. */
export function storyAsFeedPost(story: StoryTrayPost): FeedPost {
  return {
    id: story.id,
    type: 'STORY',
    createdAt: story.createdAt,
    ...(story.expiresAt === undefined ? {} : { expiresAt: story.expiresAt }),
    ...(story.author === undefined ? {} : { author: { id: story.author.id, username: story.author.username ?? null, displayName: story.author.displayName ?? null, avatar: story.author.avatar ?? null } }),
    media: (story.media ?? []).map(
      (media): FeedMedia => ({
        id: media.id,
        fileUrl: storyMediaUrl({ ...(typeof media.fileUrl === 'string' ? { fileUrl: media.fileUrl } : {}), ...(media.url === undefined ? {} : { url: media.url }) }),
        mimeType: media.mimeType ?? null,
        thumbnailUrl: media.thumbnailUrl ?? null,
        thumbHash: media.thumbHash ?? null,
        width: media.width ?? null,
        height: media.height ?? null,
      }),
    ),
  };
}

/** Ni un réel, ni une story, ni une humeur (`STATUS`) : l'onglet Publications de `ProfileSendContentKind.accepts`. */
const NOT_A_PUBLICATION: ReadonlySet<string> = new Set(['REEL', 'STORY', 'STATUS']);

const servedType = (post: FeedPost): string => post.type.toUpperCase();

export function sendContentChoices(params: {
  readonly kind: SendContentKind;
  readonly posts: readonly FeedPost[];
  readonly stories: readonly StoryTrayPost[];
}): readonly FeedPost[] {
  switch (params.kind) {
    case 'publication':
      return params.posts.filter((post) => !NOT_A_PUBLICATION.has(servedType(post)));
    case 'reel':
      return params.posts.filter((post) => servedType(post) === 'REEL');
    case 'story':
      return params.stories.map(storyAsFeedPost);
  }
}

export type SendContentListingInput = {
  readonly hasChoices: boolean;
  readonly settled: boolean;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly hasMore: boolean;
};

export type SendContentListing = 'loading' | 'failed' | 'empty' | 'choices';

/**
 * Jamais un vide avant que la première lecture ait conclu, ni tant qu'une page reste à lire ; une erreur,
 * et non un faux vide, quand la lecture a échoué sans rien servir. Des cartes en cache se montrent toujours.
 */
export function sendContentListing(input: SendContentListingInput): SendContentListing {
  if (input.hasChoices) return 'choices';
  if (!input.settled || input.loading) return 'loading';
  if (input.failed) return 'failed';
  return input.hasMore ? 'loading' : 'empty';
}

/** Aucune carte de ce genre sur ce qui est servi, et une page de plus : la feuille la demande d'elle-même. */
export const sendContentPagesFurther = (input: SendContentListingInput): boolean =>
  !input.hasChoices && input.settled && !input.loading && !input.failed && input.hasMore;

/**
 * Ce qui se joue sur place : la vidéo d'une carte qui EST une vidéo seule, muette. Un diaporama se fait
 * glisser, il ne se joue pas ; une image, une scène ou un son non plus.
 */
export function inlineVideoOf(post: FeedPost, visual: ContentCardVisual): FeedMedia | null {
  if (visual.kind !== 'media' || visual.media.kind !== 'video') return null;
  return post.media?.find((media) => media.id === visual.media.id) ?? null;
}

export function planSendContent(params: {
  readonly post: FeedPost;
  readonly person: { readonly id: string; readonly name: string };
  readonly viewerId: string;
}): SendPlanResult {
  return planSend({
    payload: publicationPayloadOf(params.post.id, params.post),
    targets: [{ kind: 'contact', userId: params.person.id, label: params.person.name }],
    caption: '',
    viewerId: params.viewerId,
  });
}

export type SendContentOutcome = 'sent' | 'offline' | 'refused';

/** Ce que l'envoi est devenu : parti, en file (hors ligne), ou refusé ; rien tant qu'il joue. */
export function sendContentOutcomeOf(status: TargetStatus | undefined): SendContentOutcome | null {
  switch (status?.state) {
    case 'sent':
      return 'sent';
    case 'queued':
      return 'offline';
    case 'failed':
      return 'refused';
    default:
      return null;
  }
}
