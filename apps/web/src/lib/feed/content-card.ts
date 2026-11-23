import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';
import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';
import { isContentKind, type ContentKind } from '@meeshy/shared/utils/content-link';

import type { FeedMedia, FeedPost } from '@/lib/api/feed-pages';
import { attachmentSrc } from '@/lib/api/media-url';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import { objectMediaIdentity } from '@/lib/canvas/carrier';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { servedRingOf } from '@/lib/profile-decor/served-ring';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';

import { feedMediaKindOf } from './layout';
import { showsPixels } from './scene-framing';
import { resolveFeedText } from './text';

/**
 * **LA CARTE D'UN CONTENU MEESHY** (#19334, parapluie #19331) — ce qu'une
 * publication servie (`GET posts/:id`, sous l'audience du lecteur) devient
 * quand un lien la désigne, dans une bulle ou sous le texte d'une publication.
 * Projection PURE, testée sans DOM ; le composant (`content-link-card.tsx`) ne
 * fait que peindre ce modèle. Référence de disposition : la carte iOS du même
 * parapluie (#19332).
 *
 * Elle ne réécrit aucune loi : le texte est servi par `resolveFeedText` (le
 * Prisme d'une publication), l'accent par `authorAccentColor`, l'heure par
 * `shortRelativeTime`, le placeholder par `thumbHashPlaceholder`.
 *
 * **Une republication NUE montre l'original** (ni texte ni média propre) : son
 * auteur, son texte et son média. Le type (pastille, libellé, porte), les
 * compteurs et le favori restent ceux de la publication que le lien désigne —
 * c'est elle qu'on a partagée, et son détail montre l'original (même règle que
 * `ContentCard.swift`, la référence iOS).
 */

/** Hauteur maximale du bloc média d'une publication, en px CSS. */
export const CONTENT_CARD_MEDIA_MAX_HEIGHT = 220;
/** Hauteur maximale du bloc média d'un réel ou d'une story — un portrait. */
export const CONTENT_CARD_PORTRAIT_MAX_HEIGHT = 260;

const PORTRAIT_RATIO = 9 / 16;
const NARROWEST_RATIO = 4 / 5;
const WIDEST_RATIO = 16 / 9;
/** Un média dont la passerelle ne sert pas les dimensions. */
const UNKNOWN_RATIO = 4 / 3;

export type ContentCardAuthor = {
  readonly name: string;
  readonly initials: string;
  readonly accentColor: string;
  readonly id?: string;
  readonly avatarSrc?: string;
  readonly ring: ServedProfileDecorItem | null;
};

export type ContentCardText = {
  /** Le texte SERVI au lecteur — une traduction, ou l'original. */
  readonly full: string;
  /** La langue dans laquelle `full` est servi (`lang` du texte peint). */
  readonly language: string;
  readonly originalLanguage: string;
};

export type ContentCardMedia = {
  /** `PostMedia.id` — celui qu'un objet de scène désigne par `postMediaId`. */
  readonly id: string;
  readonly kind: 'image' | 'video';
  /** La vignette (une image sert aussi son propre fichier) ; absente d'une vidéo sans vignette. */
  readonly src?: string;
  readonly placeholder?: string;
  /** MILLISECONDES, comme la passerelle les sert (`PostMedia.duration`). */
  readonly durationMs?: number;
  /** Les médias de plus que le premier — « +N » ; zéro, aucune pastille. */
  readonly more: number;
  /** Largeur / hauteur du bloc, bornée ; un portrait pour un réel ou une story. */
  readonly aspectRatio: number;
  readonly maxHeight: number;
};

export type ContentCardStats = {
  readonly views: number;
  readonly likes: number;
  readonly comments: number;
  /** `bookmarkCount` — il n'y a pas d'autre compteur de favoris. */
  readonly favorites: number;
};

/** Un son seul, qu'on écoute sans quitter la conversation. */
export type ContentCardSound = {
  /** L'identité de la piste : le média audio, ou `<post>-audio` pour le son de fond du contenu. */
  readonly attachmentId: string;
  /** L'adresse SERVIE : le lecteur la résout (`attachmentSrc`), comme toute pièce. */
  readonly url: string;
  readonly durationSeconds?: number;
};

/** Une page du diaporama : un média, ou une scène du document. */
export type ContentCardPage = { readonly kind: 'media'; readonly media: ContentCardMedia } | { readonly kind: 'scene'; readonly index: number };

/**
 * **CE QUE LE BLOC VISUEL MONTRE** (#20234, jumelle web de #20211 ;
 * référence `ContentCardVisual.swift`, vecteurs partagés
 * `packages/shared/fixtures/content-card-visual/`). Dans cet ordre :
 * plusieurs pages ⇒ un diaporama qu'on fait glisser ; une vidéo seule (ou une
 * scène qui n'est que ce clip) ⇒ son image de garde ; rien de peint mais un
 * son ⇒ le composant sonore ; sinon la scène composée, à défaut l'image seule,
 * et rien pour un contenu de texte.
 */
export type ContentCardVisual =
  | { readonly kind: 'none' }
  | { readonly kind: 'media'; readonly media: ContentCardMedia }
  | { readonly kind: 'slideshow'; readonly pages: readonly ContentCardPage[] }
  | { readonly kind: 'sound'; readonly sound: ContentCardSound }
  | { readonly kind: 'scene'; readonly index: number };

/** La scène à dessiner : le document, et le porteur (le contenu montré) qui indexe ses médias. */
export type ContentCardScene = { readonly document: CanvasDocument; readonly carrier: SceneCarrier };

export type ContentCardModel = {
  /** La publication que le lien désigne : c'est elle que le geste ouvre. */
  readonly postId: string;
  /** Le type de cette publication, qui choisit sa porte — `null` : inconnu, le détail. */
  readonly routeType: ContentKind | null;
  /** Le même type pour la pastille et le libellé ; un type inconnu se dit « publication ». */
  readonly type: ContentKind;
  readonly author: ContentCardAuthor;
  readonly relativeTime: string;
  readonly moodEmoji?: string;
  readonly text?: ContentCardText;
  readonly media?: ContentCardMedia;
  readonly stats: ContentCardStats;
  readonly bookmarked: boolean;
  readonly visual: ContentCardVisual;
  readonly scene?: ContentCardScene;
};

/** Ce qu'une publication et l'original d'une republication ont en commun. */
type Shown = {
  readonly id?: string;
  readonly type?: string;
  readonly createdAt?: string | Date;
  readonly content?: string | null;
  readonly originalLanguage?: string | null;
  readonly translations?: unknown;
  readonly moodEmoji?: string | null;
  readonly author?: {
    readonly id?: string;
    readonly username?: string | null;
    readonly displayName?: string | null;
    readonly avatar?: string | null;
  } | null;
  readonly media?: readonly FeedMedia[] | null;
  readonly storyEffects?: unknown;
  readonly audioUrl?: string | null;
  readonly audioDuration?: number | null;
};

const textOf = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const countOf = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

const positiveOf = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const isBare = (post: FeedPost): boolean => textOf(post.content) === undefined && (post.media ?? []).length === 0;

const shownOf = (post: FeedPost): Shown => (post.repostOf != null && isBare(post) ? post.repostOf : post);

const kindOf = (type: string | undefined): ContentKind | null => (isContentKind(type) ? type : null);

function authorOf(author: Shown['author']): ContentCardAuthor {
  const handle = textOf(author?.username);
  const name = textOf(author?.displayName)?.trim() ?? (handle === undefined ? '' : `@${handle}`);
  const avatar = textOf(author?.avatar);
  const id = textOf(author?.id);
  return {
    name,
    initials: initialsOf(name),
    accentColor: authorAccentColor(id, name),
    ...(id === undefined ? {} : { id }),
    ...(avatar === undefined ? {} : { avatarSrc: attachmentSrc(avatar) }),
    ring: servedRingOf(author),
  };
}

const orderOf = (media: FeedMedia): number => (typeof media.order === 'number' && Number.isFinite(media.order) ? media.order : 0);

const isVisual = (media: FeedMedia): boolean => {
  const kind = feedMediaKindOf(media.mimeType);
  return kind === 'image' || kind === 'video';
};

const clampedRatio = (width: number | undefined, height: number | undefined): number =>
  width === undefined || height === undefined ? UNKNOWN_RATIO : Math.min(WIDEST_RATIO, Math.max(NARROWEST_RATIO, width / height));

const orderedOf = (media: readonly FeedMedia[] | null | undefined): readonly FeedMedia[] => [...(media ?? [])].sort((a, b) => orderOf(a) - orderOf(b));

/** Un média visuel, tel qu'un bloc le peint : le portrait d'un réel ou d'une story, fût-il republié. */
function cardMediaOf(item: FeedMedia, portrait: boolean, more: number): ContentCardMedia {
  const kind = feedMediaKindOf(item.mimeType) === 'video' ? 'video' : 'image';
  const source = textOf(item.thumbnailUrl) ?? (kind === 'image' ? textOf(item.fileUrl) : undefined);
  const placeholder = thumbHashPlaceholder(textOf(item.thumbHash));
  const durationMs = kind === 'video' ? positiveOf(item.duration) : undefined;
  return {
    id: item.id,
    kind,
    ...(source === undefined ? {} : { src: attachmentSrc(source) }),
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(durationMs === undefined ? {} : { durationMs }),
    more,
    aspectRatio: portrait ? PORTRAIT_RATIO : clampedRatio(positiveOf(item.width), positiveOf(item.height)),
    maxHeight: portrait ? CONTENT_CARD_PORTRAIT_MAX_HEIGHT : CONTENT_CARD_MEDIA_MAX_HEIGHT,
  };
}

const isPortrait = (shownKind: ContentKind | null): boolean => shownKind === 'REEL' || shownKind === 'STORY';

/** Le bloc média suit le contenu MONTRÉ : son premier média visuel, et combien d'autres le suivent. */
function mediaOf(media: readonly FeedMedia[] | null | undefined, shownKind: ContentKind | null): ContentCardMedia | undefined {
  const ordered = orderedOf(media);
  const first = ordered.find(isVisual);
  return first === undefined ? undefined : cardMediaOf(first, isPortrait(shownKind), ordered.length - 1);
}

const secondsOf = (milliseconds: number | null | undefined): number | undefined => {
  const value = positiveOf(milliseconds);
  return value === undefined ? undefined : Math.floor(value / 1000);
};

/** Le premier média audio du contenu, sinon son son de fond (`audioUrl`). */
function soundOf(shown: Shown, shownId: string): ContentCardSound | undefined {
  const audio = orderedOf(shown.media).find((item) => feedMediaKindOf(item.mimeType) === 'audio' && textOf(item.fileUrl) !== undefined);
  if (audio !== undefined) {
    const durationSeconds = secondsOf(audio.duration);
    return { attachmentId: audio.id, url: audio.fileUrl!, ...(durationSeconds === undefined ? {} : { durationSeconds }) };
  }
  const url = textOf(shown.audioUrl);
  if (url === undefined) return undefined;
  const durationSeconds = secondsOf(shown.audioDuration);
  return { attachmentId: `${shownId}-audio`, url, ...(durationSeconds === undefined ? {} : { durationSeconds }) };
}

/** Le porteur de la scène : les médias du contenu MONTRÉ, résolus (le même repli de vignette que le fil). */
function sceneOf(shown: Shown, shownId: string): ContentCardScene | undefined {
  const document = parseCanvasDocument(shown.storyEffects);
  if (document === null) return undefined;
  const media = orderedOf(shown.media).flatMap((item) => {
    const file = textOf(item.fileUrl);
    if (file === undefined) return [];
    const thumbnail = textOf(item.thumbnailUrl);
    const poster = thumbnail === undefined ? thumbHashPlaceholder(textOf(item.thumbHash)) : attachmentSrc(thumbnail);
    const mimeType = textOf(item.mimeType);
    return [{ id: item.id, src: attachmentSrc(file), ...(mimeType === undefined ? {} : { mimeType }), ...(poster === undefined ? {} : { poster }) }];
  });
  return { document, carrier: { postId: shownId, media } };
}

function visualOf(pages: readonly ContentCardMedia[], sound: ContentCardSound | undefined, document: CanvasDocument | undefined): ContentCardVisual {
  const first = document?.scenes[0];
  if (document === undefined || first === undefined) {
    if (pages.length > 1) return { kind: 'slideshow', pages: pages.map((media) => ({ kind: 'media', media })) };
    if (pages[0] !== undefined) return { kind: 'media', media: pages[0] };
    return sound === undefined ? { kind: 'none' } : { kind: 'sound', sound };
  }
  if (document.scenes.length > 1) return { kind: 'slideshow', pages: document.scenes.map((_, index) => ({ kind: 'scene', index })) };
  const painted = first.objects.filter(showsPixels);
  if (painted.length === 0) return sound === undefined ? { kind: 'scene', index: 0 } : { kind: 'sound', sound };
  const only = painted.length === 1 && painted[0]!.kind === 'media' ? objectMediaIdentity(painted[0]!) : null;
  const shown = only === null ? undefined : pages.find((media) => media.id === only);
  return shown === undefined ? { kind: 'scene', index: 0 } : { kind: 'media', media: shown };
}

function textOfShown(shown: Shown, preferredLanguages: readonly string[]): ContentCardText | undefined {
  const content = textOf(shown.content);
  if (content === undefined) return undefined;
  const served = resolveFeedText({ preferredLanguages, originalLanguage: shown.originalLanguage, translations: shown.translations, content });
  return { full: served.text.trim(), language: served.language, originalLanguage: shown.originalLanguage ?? '' };
}

export function contentCardModelOf(
  post: FeedPost,
  params: {
    readonly preferredLanguages: readonly string[];
    readonly now: Date;
    /** Le type que l'ADRESSE annonçait (`/reel/<id>`…) — repli quand la passerelle sert un type inconnu. */
    readonly linkType: ContentKind | null;
    readonly language: InterfaceLanguage;
  },
): ContentCardModel {
  const shown = shownOf(post);
  const routeType = kindOf(post.type) ?? params.linkType;
  const shownKind = shown === post ? routeType : kindOf(shown.type);
  const text = textOfShown(shown, params.preferredLanguages);
  const media = mediaOf(shown.media, shownKind);
  const moodEmoji = shownKind === 'STATUS' ? textOf(shown.moodEmoji) : undefined;
  const shownId = (shown === post ? post.id : textOf(shown.id)) ?? post.id;
  const scene = sceneOf(shown, shownId);
  const pages = orderedOf(shown.media)
    .filter(isVisual)
    .map((item) => cardMediaOf(item, isPortrait(shownKind), 0));
  const visual = visualOf(pages, soundOf(shown, shownId), scene?.document);
  return {
    postId: post.id,
    routeType,
    type: routeType ?? 'POST',
    author: authorOf(shown.author),
    relativeTime: shown.createdAt === undefined ? '' : shortRelativeTime(new Date(shown.createdAt), params.now, params.language),
    ...(moodEmoji === undefined ? {} : { moodEmoji }),
    ...(text === undefined ? {} : { text }),
    ...(media === undefined ? {} : { media }),
    stats: {
      views: countOf(post.viewCount),
      likes: countOf(post.likeCount),
      comments: countOf(post.commentCount),
      favorites: countOf(post.bookmarkCount),
    },
    bookmarked: post.isBookmarkedByMe === true,
    visual,
    ...(scene === undefined ? {} : { scene }),
  };
}
