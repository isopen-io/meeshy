/**
 * L'APERÇU D'UN CONTENU POUR LES ROBOTS (#3673, parapluie #19331) — un post, un réel,
 * une story ou une humeur, déplié par WhatsApp, iMessage, Telegram, X ou Slack.
 *
 * Le robot est un lecteur SANS compte. Un contenu ne se nomme donc que si la loi de
 * lecture anonyme le sert (`isServableToAnonymous`, #9149 : public, vivant, d'un auteur
 * actif, et l'original d'une republication aussi) : la carte ne dit alors rien que le
 * lien n'ouvre déjà à quiconque le tient. Tout le reste rend l'aperçu GÉNÉRIQUE de
 * Meeshy, le même pour tous, qui ne dit pas si le contenu existe.
 *
 * Ce qui part : le TYPE et l'AUTEUR (« Réel de Amani Diallo »), le TEXTE, l'IMAGE (le
 * média, la vignette d'une vidéo, sinon l'avatar de l'auteur, sinon l'image de marque)
 * et, pour une vidéo qu'un robot sait jouer, `og:video`. Jamais un compteur, une
 * audience, un destinataire ni une coordonnée : le `select` ne les charge pas.
 *
 * Langue (Prisme, face du cadrage) : celle que le robot demande (`Accept-Language`),
 * puis la langue d'origine du contenu, puis le français. Le texte descend les langues
 * du robot : une traduction à un rang servi gagne, sinon l'original (règle 1, jamais
 * une autre traduction).
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { buildPostTranslationRecord, resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { contentWebUrl } from '@meeshy/shared/utils/content-link';
import { formatClock } from '@meeshy/shared/utils/duration-format';
import { isServableToAnonymous } from '../../routes/posts/anonymousPostGate';
import { NOT_DELETED } from '../posts/softDelete';
import { publicMediaUrlFromEnv } from '../attachments/publicMediaUrl';
import { UNFURL_COPY, unfurlLanguageOf, type UnfurlContentKind, type UnfurlCopy, type UnfurlLanguage, type UnfurlMediaNature } from './catalog';
import {
  acceptedLanguages,
  cleanUserText,
  composeLinkUnfurl,
  LINK_UNFURL_OPEN_QUERY,
  type LinkUnfurl,
  type UnfurlImageMeta,
  type UnfurlVideo
} from './page';

const NAME_MAX = 60;
const TEXT_MAX = 200;
const DEFAULT_LANGUAGE: UnfurlLanguage = 'fr';

/** La plus grande largeur d'image qu'un robot d'aperçu télécharge sans la refuser. */
const IMAGE_WIDTH_MAX = 1200;

/**
 * Un original JPEG ou PNG part tel quel jusqu'à ce poids : ce sont les seuls formats que
 * TOUS les robots lisent (WhatsApp lit mal le WebP, que sont nos variantes et vignettes).
 */
const ORIGINAL_IMAGE_BYTES_MAX = 1_000_000;
const UNIVERSAL_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png']);

/** Les codecs qu'un lecteur de robot (Facebook, Telegram, Discord) sait jouer. */
const PLAYABLE_VIDEO_CODECS: ReadonlySet<string> = new Set(['h264', 'avc', 'avc1']);

const MEDIA_GLYPH: Readonly<Record<UnfurlMediaNature, string>> = { image: '📷', video: '🎬', audio: '🎤' };

const CONTENT_KINDS: ReadonlySet<string> = new Set<UnfurlContentKind>(['POST', 'REEL', 'STORY', 'STATUS']);

const authorSelect = {
  username: true,
  displayName: true,
  avatar: true,
  isActive: true,
  deletedAt: true,
  deactivatedAt: true
} as const;

const mediaSelect = {
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  thumbnailUrl: true,
  width: true,
  height: true,
  duration: true,
  imageVariants: true,
  renditions: true,
  videoCodec: true,
  variantOf: true
} as const;

/**
 * Ce que l'aperçu lit d'un contenu — un SUR-ENSEMBLE de `ANONYMOUS_POST_ACL_SELECT`, que
 * la garde lit : la loi de lecture anonyme s'applique telle quelle, sans seconde copie.
 */
const contentUnfurlSelect = {
  id: true,
  type: true,
  visibility: true,
  deletedAt: true,
  expiresAt: true,
  repostOfId: true,
  content: true,
  originalLanguage: true,
  translations: true,
  moodEmoji: true,
  author: { select: authorSelect },
  media: { select: mediaSelect, orderBy: { order: 'asc' } },
  repostOf: {
    select: {
      visibility: true,
      deletedAt: true,
      expiresAt: true,
      content: true,
      originalLanguage: true,
      translations: true,
      media: { select: mediaSelect, orderBy: { order: 'asc' } }
    }
  }
} satisfies Prisma.PostSelect;

type UnfurlMediaRow = {
  readonly mimeType: string;
  readonly fileSize: number | null;
  readonly fileUrl: string;
  readonly thumbnailUrl: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly duration: number | null;
  readonly imageVariants: unknown;
  readonly renditions: unknown;
  readonly videoCodec: string | null;
  readonly variantOf?: string | null;
};

type Lifetime = { readonly visibility: string; readonly deletedAt: Date | null; readonly expiresAt: Date | null };

type Readable = {
  readonly content: string | null;
  readonly originalLanguage: string | null;
  readonly translations: unknown;
  readonly media: readonly UnfurlMediaRow[];
};

export type ContentUnfurlSource = Lifetime & Readable & {
  readonly id: string;
  readonly type: string;
  readonly repostOfId: string | null;
  readonly moodEmoji: string | null;
  readonly author: {
    readonly username: string;
    readonly displayName: string | null;
    readonly avatar: string | null;
    readonly isActive: boolean;
    readonly deletedAt: Date | null;
    readonly deactivatedAt: Date | null;
  } | null;
  readonly repostOf: (Lifetime & Readable) | null;
};

/** Un identifiant de contenu plausible : un ObjectId. Tout le reste est inconnu, sans lecture. */
export function isContentUnfurlId(postId: string): boolean {
  return isValidObjectId(postId);
}

export async function loadContentUnfurlSource(prisma: PrismaClient, postId: string): Promise<ContentUnfurlSource | null> {
  return prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: contentUnfurlSelect
  });
}

const isContentKind = (type: string): type is UnfurlContentKind => CONTENT_KINDS.has(type);

/** Une adresse qu'un robot peut aller chercher : absolue et en `https`. */
function publicUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) return null;
  const url = publicMediaUrlFromEnv(trimmed);
  return /^https:\/\//i.test(url) ? url : null;
}

const natureOf = (media: UnfurlMediaRow): UnfurlMediaNature | null => {
  const mime = media.mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
};

type Rendition = { readonly url: string; readonly width: number; readonly height: number; readonly codec?: string; readonly format?: string };

const renditionsOf = (raw: unknown): readonly Rendition[] =>
  Array.isArray(raw)
    ? raw.filter((entry): entry is Rendition =>
        typeof entry === 'object' && entry !== null &&
        typeof (entry as Rendition).url === 'string' &&
        Number.isFinite((entry as Rendition).width) && Number.isFinite((entry as Rendition).height))
    : [];

type ServedImage = { readonly url: string; readonly meta: UnfurlImageMeta | null };

/** Un original que tous les robots lisent, sinon la plus grande variante WebP acceptée, sinon la vignette, sinon l'original. */
function imageOf(media: UnfurlMediaRow): ServedImage | null {
  const mime = media.mimeType.toLowerCase();
  const original = publicUrl(media.fileUrl);
  const universal = UNIVERSAL_IMAGE_TYPES.has(mime) && media.fileSize !== null && media.fileSize <= ORIGINAL_IMAGE_BYTES_MAX;
  if (universal && original !== null) {
    const meta = media.width !== null && media.height !== null ? { type: mime, width: media.width, height: media.height } : null;
    return { url: original, meta };
  }
  const variant = renditionsOf(media.imageVariants)
    .filter((entry) => entry.width <= IMAGE_WIDTH_MAX && (entry.format ?? 'webp') === 'webp')
    .reduce<Rendition | null>((best, entry) => (best === null || entry.width > best.width ? entry : best), null);
  const variantUrl = publicUrl(variant?.url);
  if (variant !== null && variantUrl !== null) {
    return { url: variantUrl, meta: { type: 'image/webp', width: variant.width, height: variant.height } };
  }
  const fallback = publicUrl(media.thumbnailUrl) ?? original;
  return fallback === null ? null : { url: fallback, meta: null };
}

/** Le fichier H.264 d'une vidéo : son rendu de compatibilité, sinon l'original s'il en est un. */
function playableVideoOf(media: UnfurlMediaRow): UnfurlVideo | null {
  const rendition = renditionsOf(media.renditions).find((entry) => PLAYABLE_VIDEO_CODECS.has((entry.codec ?? '').toLowerCase()));
  const renditionUrl = publicUrl(rendition?.url);
  if (rendition !== undefined && renditionUrl !== null) {
    return { url: renditionUrl, type: 'video/mp4', width: rendition.width, height: rendition.height };
  }
  const codec = (media.videoCodec ?? '').toLowerCase();
  const fileUrl = publicUrl(media.fileUrl);
  if (fileUrl === null || media.mimeType.toLowerCase() !== 'video/mp4' || !PLAYABLE_VIDEO_CODECS.has(codec)) return null;
  return { url: fileUrl, type: 'video/mp4', width: media.width, height: media.height };
}

type ServedVisual = { readonly image: ServedImage; readonly video: UnfurlVideo | null };

/** Le premier média qui se MONTRE : une image, ou la vignette d'une vidéo. Un son ne se montre pas. */
function visualOf(media: readonly UnfurlMediaRow[]): ServedVisual | null {
  for (const entry of media) {
    const nature = natureOf(entry);
    if (nature === 'image') {
      const image = imageOf(entry);
      if (image !== null) return { image, video: null };
    }
    if (nature === 'video') {
      const poster = publicUrl(entry.thumbnailUrl);
      if (poster !== null) return { image: { url: poster, meta: null }, video: playableVideoOf(entry) };
    }
  }
  return null;
}

/** « 🎬 Vidéo · 0:42 » : la description d'un média sans texte. */
function mediaDescription(copy: UnfurlCopy, media: readonly UnfurlMediaRow[]): string | null {
  const first = media.find((entry) => natureOf(entry) !== null);
  if (first === undefined) return null;
  const nature = natureOf(first) as UnfurlMediaNature;
  const label = `${MEDIA_GLYPH[nature]} ${copy.mediaNature[nature]}`;
  const duration = nature !== 'image' && first.duration !== null && first.duration > 0 ? formatClock(first.duration / 1000) : null;
  return duration === null ? label : `${label} · ${duration}`;
}

/** Le texte du contenu dans les langues du robot : une traduction à un rang servi, sinon l'original. */
function servedText(readable: Readable, robotLanguages: readonly string[]): string | null {
  const served = resolvePrismTranslation({
    translations: buildPostTranslationRecord(readable.translations),
    originalLanguage: readable.originalLanguage,
    preferredLanguages: robotLanguages
  });
  return cleanUserText(served?.text ?? readable.content, TEXT_MAX);
}

function copyLanguage(robotLanguages: readonly string[], originalLanguage: string | null): UnfurlLanguage {
  const candidates = [...robotLanguages, originalLanguage ?? ''];
  return candidates.map(unfurlLanguageOf).find((language): language is UnfurlLanguage => language !== null) ?? DEFAULT_LANGUAGE;
}

/** Les médias propres du contenu : une variante générée (piste traduite) n'en est pas un. */
const ownMedia = (media: readonly UnfurlMediaRow[]): readonly UnfurlMediaRow[] => media.filter((entry) => !entry.variantOf);

export function composeContentUnfurl(params: {
  readonly source: ContentUnfurlSource | null;
  readonly acceptLanguage: string | undefined;
  readonly origin: string;
  readonly now: Date;
}): LinkUnfurl {
  const { source, acceptLanguage, origin, now } = params;
  const generic = composeLinkUnfurl({ source: null, identifier: '', acceptLanguage, origin, now });
  if (source === null || !isContentKind(source.type) || !isServableToAnonymous(source, now)) return generic;

  const author = source.author;
  const username = cleanUserText(author?.username, NAME_MAX);
  if (author === null || username === null) return generic;
  const name = cleanUserText(author.displayName, NAME_MAX) ?? `@${username}`;

  const ownText = cleanUserText(source.content, TEXT_MAX);
  const readable: Readable = ownText === null && source.repostOf !== null ? source.repostOf : source;
  const media = ownMedia(source.media).length > 0 || source.repostOf === null ? ownMedia(source.media) : ownMedia(source.repostOf.media);

  const robotLanguages = acceptedLanguages(acceptLanguage);
  const lang = copyLanguage(robotLanguages, readable.originalLanguage);
  const copy = UNFURL_COPY[lang];
  const text = servedText(readable, robotLanguages);
  const mood = source.type === 'STATUS' ? cleanUserText(source.moodEmoji, 8) : null;
  const body = [mood, text].filter((part): part is string => part !== null).join(' ');
  const description = body.length > 0 ? body : mediaDescription(copy, media) ?? copy.contentPromise;

  const url = contentWebUrl(origin, source.type, source.id);
  const card: LinkUnfurl = {
    ...generic,
    lang,
    dir: copy.dir,
    locale: copy.locale,
    title: copy.contentBy[source.type](name),
    description,
    url,
    openUrl: `${url}?${LINK_UNFURL_OPEN_QUERY}`,
    linkLabel: copy.openContent,
    imageAlt: name,
    ogType: 'article'
  };

  const visual = visualOf(media);
  if (visual !== null) {
    return {
      ...card,
      imageUrl: visual.image.url,
      imageMeta: visual.image.meta,
      card: 'summary_large_image',
      ogType: visual.video === null ? 'article' : 'video.other',
      video: visual.video
    };
  }
  const avatar = publicUrl(author.avatar);
  return avatar === null ? { ...card, imageAlt: generic.imageAlt } : { ...card, imageUrl: avatar, imageMeta: null, card: 'summary' };
}
