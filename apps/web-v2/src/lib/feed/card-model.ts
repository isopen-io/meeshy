import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { attachmentSrc } from '@/lib/api/media-url';
import type { FeedPost } from '@/lib/api/feed-pages';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';

import { resolveMediaCaption } from '@/lib/api/prism';

import { feedMediaKindOf, postMediaRatio, reelCardRatio, type FeedMediaKind } from './layout';
import { resolveMosaicLayout, type MosaicLayoutMode } from './mosaic-layout';
import { resolveFeedText } from './text';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';

/**
 * LE MODÈLE D'UNE CARTE DU FIL (#5893) — PURE : `resolveFeedCardModel`
 * transforme un `FeedPost` (la forme du wire, § `feed-pages.ts`) en ce que
 * `FeedPostCard` PEINT, rien de plus. Séparer les deux, c'est ce qui rend le
 * calcul testable SANS DOM (motif `ProgressionBody`/`resolveEngagementProgress`,
 * `routes/progression.tsx`).
 */
export type FeedCardMedia = {
  readonly id: string;
  readonly kind: FeedMediaKind;
  readonly src: string;
  readonly thumbnailSrc?: string;
  readonly placeholder?: string;
  readonly ratio: number;
  /** MILLISECONDES, comme la passerelle et iOS les servent — voir
   * `FeedMedia.duration` (`api/feed-pages.ts`). */
  readonly durationMs?: number;
  /** LE TEXTE SERVI PAR LE PRISME (#6280, `resolveMediaCaption` — jamais
   * `PostMedia.caption` brut) : la langue résolue peut différer de la
   * langue source dès qu'une traduction du lecteur existe. */
  readonly caption?: string;
  /** La langue DANS LAQUELLE `caption` ci-dessus est servie — porte
   * l'attribut `lang` de la légende affichée (§ Prisme cycle 122 : un
   * résolveur qui élit la bonne traduction n'a corrigé personne tant qu'on
   * ne sait pas QUI l'affiche, dans quelle langue). Absente seulement quand
   * ni `captionLanguage` ni le Prisme n'ont pu la dire. */
  readonly captionLanguage?: string;
  /** Vrai quand `caption` est une TRADUCTION de `PostMedia.caption`, jamais
   * la légende source. */
  readonly captionTranslated?: boolean;
  /** LE TEXTE D'ACCESSIBILITÉ SERVI PAR LA PASSERELLE — `PostMedia.alt`
   * (`schema.prisma:3618`, « Accessibilité »). Il était DÉCLARÉ sur le wire
   * (`FeedMedia.alt`) et jeté par le modèle : chaque image du fil partait en
   * `alt=""`, décorative, invisible au lecteur d'écran (revue-correction
   * #5893). La LÉGENDE ne le remplace pas — elle est déjà rendue en texte
   * VISIBLE sous le média, et la répéter en `alt` la ferait lire deux fois. */
  readonly altText?: string;
};

export type FeedCardAuthor = {
  readonly name: string;
  readonly initials: string;
  readonly accentColor: string;
  readonly avatarSrc?: string;
};

export type FeedCardText = { readonly full: string; readonly language: string; readonly translated: boolean };

export type FeedCardStats = {
  readonly likeCount: number;
  readonly commentCount: number;
  readonly repostCount: number;
  readonly bookmarkCount: number;
  readonly shareCount: number;
};

/** CE QUE LE LECTEUR A DÉJÀ FAIT de ce post (#6278) — `isLikedByMe` (le nom SERVI — `PostFeedService.ts:1197` ; le wire n'a jamais porté `isLiked`) /
 * `isBookmarkedByMe` servis par la passerelle ; non servi ⇒ `false`, le
 * contrôle se peint vide plutôt que d'affirmer un geste jamais posé. */
export type FeedCardViewer = { readonly liked: boolean; readonly bookmarked: boolean };

export type FeedCardModel = {
  readonly id: string;
  readonly viewer: FeedCardViewer;
  readonly isReel: boolean;
  readonly author: FeedCardAuthor;
  readonly relativeTime: string;
  readonly repostOfHandle?: string;
  readonly text?: FeedCardText;
  readonly media: readonly FeedCardMedia[];
  /** L'agencement CHOISI par l'auteur (#6514, `resolveMosaicLayout`) —
   * `carousel` quand le document n'en dit rien. */
  readonly layout: MosaicLayoutMode;
  readonly stats: FeedCardStats;
};

const FALLBACK_AUTHOR_NAME = 'Quelqu’un';

/**
 * LE FILTRE DE NULLITÉ DU FIL (défaut BLOQUANT, revue-correction #5893) —
 * un champ optionnel de la passerelle arrive en `null`, jamais absent (voir
 * le doc-comment de `FeedAuthor`, `api/feed-pages.ts`). Ces deux gardes
 * testent le TYPE plutôt que l'absence : c'est la seule forme qui traverse
 * `null`, `undefined` ET la chaîne vide sans lever.
 */
const textOrUndefined = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

const numberOrUndefined = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function resolveAuthorSrc(avatar: string | null | undefined): string | undefined {
  const url = textOrUndefined(avatar);
  return url === undefined ? undefined : attachmentSrc(url);
}

function resolveMedia(
  post: FeedPost,
  isReel: boolean,
  preferredLanguages: readonly string[],
): readonly FeedCardMedia[] {
  const media = post.media ?? [];
  const ordered = [...media].sort((a, b) => (numberOrUndefined(a.order) ?? 0) - (numberOrUndefined(b.order) ?? 0));
  return ordered.map((m) => {
    // Capturé UNE fois : `exactOptionalPropertyTypes` narrove `string |
    // undefined` en `string` seulement quand le test et l'usage portent sur
    // la MÊME référence — deux appels séparés à `thumbHashPlaceholder`
    // resteraient chacun `string | undefined` aux yeux du compilateur.
    const placeholder = thumbHashPlaceholder(textOrUndefined(m.thumbHash));
    const thumbnail = textOrUndefined(m.thumbnailUrl);
    const rawCaption = textOrUndefined(m.caption);
    // Le Prisme (#6280) : `PostMedia.caption` n'est traduit QUE quand il
    // existe — une pièce sans légende n'a rien à résoudre, et
    // `resolveMediaCaption` sur une chaîne vide rendrait un `language`
    // trompeur (l'original vide « servi » dans la langue du lecteur).
    const resolvedCaption =
      rawCaption === undefined
        ? undefined
        : resolveMediaCaption({
            preferredLanguages,
            captionLanguage: m.captionLanguage,
            captionTranslations: m.captionTranslations,
            caption: rawCaption,
          });
    const captionLanguage = resolvedCaption === undefined ? undefined : textOrUndefined(resolvedCaption.language);
    const altText = textOrUndefined(m.alt);
    const durationMs = numberOrUndefined(m.duration);
    const width = numberOrUndefined(m.width);
    const height = numberOrUndefined(m.height);
    return {
      id: m.id,
      kind: feedMediaKindOf(m.mimeType),
      src: attachmentSrc(m.fileUrl),
      ...(thumbnail !== undefined ? { thumbnailSrc: attachmentSrc(thumbnail) } : {}),
      ...(placeholder !== undefined ? { placeholder } : {}),
      ratio: isReel ? reelCardRatio(width, height) : postMediaRatio(width, height),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(resolvedCaption !== undefined ? { caption: resolvedCaption.text, captionTranslated: resolvedCaption.translated } : {}),
      ...(captionLanguage !== undefined ? { captionLanguage } : {}),
      ...(altText !== undefined ? { altText } : {}),
    };
  });
}

/**
 * `resolveFeedCardModel` — LE SITE UNIQUE qui compose : la géographie du
 * type (`REEL` ⇒ affiche plein cadre), le Prisme du corps
 * (`resolveFeedText`, `lib/feed/text.ts` — JAMAIS réécrit ici, D-14),
 * l'accent de l'auteur (`authorAccentColor`, miroir `FeedModels.swift:255`),
 * et l'heure relative (`shortRelativeTime`, déjà consommée par la Lentille).
 */
export function resolveFeedCardModel(
  post: FeedPost,
  params: { readonly preferredLanguages: readonly string[]; readonly now: Date },
): FeedCardModel {
  const isReel = post.type === 'REEL';
  const authorName =
    textOrUndefined(post.author?.displayName) ?? textOrUndefined(post.author?.username) ?? FALLBACK_AUTHOR_NAME;
  const content = post.content ?? '';
  const text =
    content.trim() === ''
      ? undefined
      : (() => {
          const resolved = resolveFeedText({
            preferredLanguages: params.preferredLanguages,
            originalLanguage: post.originalLanguage,
            translations: post.translations,
            content,
          });
          return { full: resolved.text, language: resolved.language, translated: resolved.translated };
        })();

  const avatarSrc = resolveAuthorSrc(post.author?.avatar);
  const repostOfHandle = textOrUndefined(post.repostOf?.author?.username);

  return {
    id: post.id,
    viewer: { liked: post.isLikedByMe === true, bookmarked: post.isBookmarkedByMe === true },
    isReel,
    author: {
      name: authorName,
      initials: initialsOf(authorName),
      accentColor: authorAccentColor(post.author?.id, authorName),
      ...(avatarSrc !== undefined ? { avatarSrc } : {}),
    },
    relativeTime: shortRelativeTime(new Date(post.createdAt), params.now),
    ...(repostOfHandle !== undefined ? { repostOfHandle } : {}),
    ...(text !== undefined ? { text } : {}),
    media: resolveMedia(post, isReel, params.preferredLanguages),
    layout: resolveMosaicLayout(post.storyEffects),
    stats: {
      likeCount: numberOrUndefined(post.likeCount) ?? 0,
      commentCount: numberOrUndefined(post.commentCount) ?? 0,
      repostCount: numberOrUndefined(post.repostCount) ?? 0,
      bookmarkCount: numberOrUndefined(post.bookmarkCount) ?? 0,
      shareCount: numberOrUndefined(post.shareCount) ?? 0,
    },
  };
}
