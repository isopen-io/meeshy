import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { attachmentSrc } from '@/lib/api/media-url';
import type { FeedPost } from '@/lib/api/feed-pages';
import { shortRelativeTime } from '@/lib/relative-time';
import { initialsOf } from '@/lib/view/conversation';

import { resolveMediaCaption } from '@/lib/api/prism';
import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';
import type { SceneCarrier } from '@/lib/canvas/carrier';

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
  /** LE MIME SERVI (#6903) — le porteur d'une scène (`FeedCardScene.carrier`,
   * ci-dessous) en a besoin pour ÉLIRE son son de fond
   * (`electBackgroundTrack`, `lib/canvas/background-sound.ts:80` :
   * `document.sound: { source: 'original' }` élit « le premier média AUDIO
   * du porteur », PAR le MIME). Sans lui, aucun réel ni post composé du fil
   * n'a jamais de son de fond — le porteur de STORY le reporte déjà
   * (`lib/stories/carrier.ts:37`), celui du fil ne le faisait pas. */
  readonly mimeType?: string;
  readonly src: string;
  readonly thumbnailSrc?: string;
  readonly placeholder?: string;
  readonly ratio: number;
  /** MILLISECONDES, comme la passerelle et iOS les servent — voir
   * `FeedMedia.duration` (`api/feed-pages.ts`). */
  readonly durationMs?: number;
  /** LE TEXTE SERVI PAR LE PRISME (#6280, `resolveMediaCaption` — jamais
   * `PostMedia.caption` brut) : la langue résolue peut différer de la
   * langue source dès qu'une traduction du lecteur existe.
   *
   * **Repli sur le contenu du post (#6864)** — UNIQUEMENT quand ce média est
   * seul (`post.media.length === 1`) ET ne porte aucune légende propre : le
   * contenu du post, déjà résolu par le Prisme, en tient lieu. Un post à
   * PLUSIEURS médias ne pose JAMAIS son texte sur un média qui n'a pas sa
   * propre légende — le texte décrit le LOT, pas une pièce, et le poser
   * dessous ferait mentir la légende sur les autres pièces du même post. */
  readonly caption?: string;
  /** La langue DANS LAQUELLE `caption` ci-dessus est servie — porte
   * l'attribut `lang` de la légende affichée (§ Prisme cycle 122 : un
   * résolveur qui élit la bonne traduction n'a corrigé personne tant qu'on
   * ne sait pas QUI l'affiche, dans quelle langue). Absente seulement quand
   * ni `captionLanguage` ni le Prisme n'ont pu la dire. */
  readonly captionLanguage?: string;
  /** Vrai quand `caption` est une TRADUCTION de sa source, jamais la source
   * elle-même. QUELLE source, c'est `captionOrigin` qui le dit — depuis
   * #6864 une légende peut venir du média OU du post, et ce drapeau seul ne
   * permettait plus de savoir ce qu'il qualifiait. */
  readonly captionTranslated?: boolean;
  /**
   * **D'OÙ VIENT LA LÉGENDE** (#6864) — `'media'` : la légende PROPRE du
   * média (`PostMedia.caption`) ; `'post'` : le contenu du post, servi en
   * l'absence de légende propre ET seulement sur un média UNIQUE.
   *
   * Ce marqueur n'est pas décoratif : les deux provenances portent des
   * traductions DIFFÉRENTES — `PostMedia.captionTranslations` d'un côté,
   * `Post.translations` de l'autre. Servir les unes sur l'autre est
   * exactement ce que #4904 a coûté, et une chaîne nue ne dit pas laquelle
   * des deux on affiche. Miroir de `SceneCaption.Origin` côté iOS
   * (`SceneCaption.swift`, `mediaCaption` / `carrierText`).
   *
   * Absent quand `caption` l'est.
   */
  readonly captionOrigin?: 'media' | 'post';
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
  /**
   * LE PSEUDO, PARCE QUE L'AVATAR OUVRE LE PROFIL (#6396) — l'adresse d'un
   * profil est `/u/$username`, jamais l'identifiant (`route-table.tsx:191`).
   *
   * Il est ABSENT quand la passerelle n'en sert pas : un auteur anonyme n'a pas
   * de pseudo, et `Avatar` ne fabrique alors aucun lien plutôt que d'en poser
   * un vers `/u/` — une adresse qui n'existe pas.
   */
  readonly username?: string;
  /**
   * L'IDENTIFIANT, parce que l'anneau de story se cherche par lui (#7185) —
   * le corpus du rail indexe ses groupes par `authorId`, jamais par pseudo.
   * Absent quand la passerelle ne sert pas d'auteur : aucun anneau alors, ce
   * qui est la dégradation juste.
   */
  readonly id?: string;
};

export type FeedCardText = {
  readonly full: string;
  readonly language: string;
  readonly translated: boolean;
  /**
   * CE QUE LE GESTE OUVRE (#7141) — le texte tel que son autrice l'a écrit, et
   * sa langue. Le Prisme sert la traduction par DÉFAUT (§ Automatisme) ; sans
   * ces deux champs la carte pourrait ANNONCER une traduction sans offrir de
   * chemin vers l'original, c'est-à-dire un contrôle sans effet (loi 4) — le
   * défaut qui a déjà coûté `PostCard` au dépôt.
   *
   * Portés même quand rien n'est traduit : c'est `translated` qui décide de
   * l'annonce, et un champ conditionnel obligerait chaque lecteur à refaire ce
   * test.
   */
  readonly original: string;
  readonly originalLanguage: string;
};

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

/** LA SCÈNE D'UNE PUBLICATION (D-78, #6898) — le document canvas v3 déjà
 * PARSÉ (`parseCanvasDocument`, `lib/canvas/document.ts`) et son PORTEUR : les
 * médias déjà résolus par le Prisme (`FeedCardMedia[]` ci-dessus), jamais une
 * seconde descente (cycle 128 du CLAUDE.md). `undefined` ⇒ repli média
 * (D-78) : `v !== 3`, `scenes` absent/vide, ou pas de `storyEffects`. */
export type FeedCardScene = { readonly document: CanvasDocument; readonly carrier: SceneCarrier };

export type FeedCardModel = {
  readonly id: string;
  readonly viewer: FeedCardViewer;
  readonly isReel: boolean;
  readonly author: FeedCardAuthor;
  readonly relativeTime: string;
  /** L'HORLOGE ISO du post, TELLE QUE SERVIE (#6902) — `relativeTime` ci-dessus
   * est déjà la projection HUMAINE (« il y a 3 min »), qui se PÉRIME (`useMinute`)
   * et ne porte pas de date absolue : le pied de la galerie plein écran
   * (`CarrierFooter`, miroir `bottomMetadataOverlay`) a besoin de la date BRUTE
   * pour son propre format (`toLocaleString`), comme `MediaCarrier.sentAt`. */
  readonly createdAt: string;
  readonly repostOfHandle?: string;
  readonly text?: FeedCardText;
  /**
   * LES PSEUDOS QUE LE SERVEUR A VALIDÉS (#7032) — le jeu qui décide quels
   * `@handle` du texte deviennent des liens. ABSENT (relation non chargée) ⇒
   * tout handle est cliquable ; `[]` ⇒ aucun. Voir `FeedPost.mentions`.
   */
  readonly validatedMentions?: readonly string[];
  readonly media: readonly FeedCardMedia[];
  readonly scene?: FeedCardScene;
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

/**
 * **LE CONTENU DU POST N'EST PAS LA LÉGENDE DE SES MÉDIAS** (#6864, directive
 * porteur 2026-09-16) — l'ordre de priorité, en trois temps :
 *
 * 1. la légende PROPRE du média gagne TOUJOURS, quel que soit leur nombre ;
 * 2. à défaut, le contenu du post, **et seulement si le post ne porte qu'UN
 *    média** ;
 * 3. sinon, aucune légende.
 *
 * Le texte d'un post décrit le LOT ; le coller sous chaque pièce ferait mentir
 * la légende — et sur un post à média unique, une implémentation fautive et une
 * juste rendent le MÊME résultat. C'est le vecteur à deux médias dont l'un
 * seulement porte sa légende qui les sépare.
 *
 * PORTAGE de la loi iOS, qui l'applique déjà aux deux conditions :
 * `SocialMediaCaption.map` / `.serving` (`CommentMediaGallery.swift:36,141`) —
 * `let fallback = visuals.count == 1 ? carrierText : nil`, puis
 * `resolve(own:carrierText:)` qui essaie la légende propre d'abord.
 *
 * **ÉCART ASSUMÉ avec iOS sur ce qui COMPTE** : iOS ne compte que les visuels
 * paginables (`isPageable`), ce module compte TOUS les médias. La directive dit
 * « plusieurs contenu (image, vidéo **et autre**) » — un post portant une image
 * et un document porte bien deux contenus, et son texte les décrit tous deux.
 *
 * `carrier` est le texte DÉJÀ SERVI par le Prisme (`resolveFeedText`, calculé
 * une fois par `resolveFeedCardModel`), jamais `post.content` brut : le
 * redescendre ici ferait une SECONDE descente, exactement le défaut que le
 * cycle 128 a fermé sur trois clients.
 */
function resolveMedia(
  post: FeedPost,
  isReel: boolean,
  preferredLanguages: readonly string[],
  /** Le texte du post, DÉJÀ résolu par le Prisme (`resolveFeedCardModel`,
   * même valeur que `model.text`) — jamais recalculé ici (D-14). Repli
   * possible pour la légende d'un média SEUL (#6864), voir plus bas. */
  soleMediaCaptionFallback: FeedCardText | undefined,
): readonly FeedCardMedia[] {
  const media = post.media ?? [];
  const ordered = [...media].sort((a, b) => (numberOrUndefined(a.order) ?? 0) - (numberOrUndefined(b.order) ?? 0));
  // Le repli sur le contenu du post (#6864) ne s'applique QUE si ce média
  // est SEUL : à plusieurs médias, le texte du post décrit le lot, jamais
  // une pièce précise, et le coller sous l'une d'elles ferait mentir la
  // légende sur ses voisines.
  const fallback = ordered.length === 1 ? soleMediaCaptionFallback : undefined;
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
    // Une légende PROPRE gagne toujours ; à défaut, et seulement pour un
    // média seul, le contenu du post en tient lieu (#6864) — jamais l'inverse.
    //
    // `origin` voyage AVEC le texte, dans la même valeur : `caption`,
    // `captionLanguage`, `captionTranslated` et `captionOrigin` sont alors
    // composés d'une seule branche et ne peuvent pas se contredire. Sans lui,
    // `captionTranslated` — documenté « une traduction de sa source » — ne
    // dirait plus DE QUELLE source, et les deux provenances n'ont pas les
    // mêmes traductions (`PostMedia.captionTranslations` contre
    // `Post.translations`) : les mélanger est ce que #4904 a coûté.
    const caption =
      resolvedCaption !== undefined
        ? {
            text: resolvedCaption.text,
            language: resolvedCaption.language,
            translated: resolvedCaption.translated,
            origin: 'media' as const,
          }
        : fallback !== undefined
          ? { text: fallback.full, language: fallback.language, translated: fallback.translated, origin: 'post' as const }
          : undefined;
    const captionLanguage = caption === undefined ? undefined : textOrUndefined(caption.language);
    const altText = textOrUndefined(m.alt);
    const durationMs = numberOrUndefined(m.duration);
    const width = numberOrUndefined(m.width);
    const height = numberOrUndefined(m.height);
    const mimeType = textOrUndefined(m.mimeType);
    return {
      id: m.id,
      kind: feedMediaKindOf(m.mimeType),
      ...(mimeType !== undefined ? { mimeType } : {}),
      src: attachmentSrc(m.fileUrl),
      ...(thumbnail !== undefined ? { thumbnailSrc: attachmentSrc(thumbnail) } : {}),
      ...(placeholder !== undefined ? { placeholder } : {}),
      ratio: isReel ? reelCardRatio(width, height) : postMediaRatio(width, height),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(caption !== undefined
        ? { caption: caption.text, captionTranslated: caption.translated, captionOrigin: caption.origin }
        : {}),
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
          return {
            full: resolved.text,
            language: resolved.language,
            translated: resolved.translated,
            original: content,
            originalLanguage: post.originalLanguage ?? '',
          };
        })();

  const avatarSrc = resolveAuthorSrc(post.author?.avatar);
  const repostOfHandle = textOrUndefined(post.repostOf?.author?.username);
  const media = resolveMedia(post, isReel, params.preferredLanguages, text);
  const document = parseCanvasDocument(post.storyEffects);
  // Le PORTEUR d'une scène est fait des médias DÉJÀ résolus par le Prisme
  // (`media` ci-dessus) — jamais une seconde descente (cycle 128 du
  // CLAUDE.md racine).
  const scene: FeedCardScene | undefined =
    document === null
      ? undefined
      : {
          document,
          carrier: {
            postId: post.id,
            // `width`/`height` ne sont PAS reportés ici : le player rend un
            // objet `media` d'après SA PROPRE charge canvas
            // (`payload.mediaType`, `payload.aspectRatio`), jamais d'après le
            // porteur. `mimeType` Y ENTRE (#6903) parce que l'ÉLECTION du son
            // de fond (`electBackgroundTrack`, `background-sound.ts:80`) lit
            // LE PORTEUR, jamais le canvas — et le porteur de STORY le
            // reporte déjà (`lib/stories/carrier.ts:37`). Le porteur sert
            // donc l'IDENTITÉ, la LÉGENDE, le MIME (pour l'élection du son)
            // et, pour une vidéo de fond, la VIGNETTE (revue-correction
            // #6898) : `thumbnailSrc ?? placeholder`, le MÊME repli que
            // `FeedMediaSurface` pose en `poster` sur une vidéo de post.
            media: media.map((m) => {
              const poster = m.thumbnailSrc ?? m.placeholder;
              return {
                id: m.id,
                src: m.src,
                ...(m.mimeType !== undefined ? { mimeType: m.mimeType } : {}),
                ...(m.caption !== undefined ? { caption: m.caption } : {}),
                ...(m.captionLanguage !== undefined ? { captionLanguage: m.captionLanguage } : {}),
                ...(m.captionOrigin !== undefined ? { captionOrigin: m.captionOrigin } : {}),
                ...(poster !== undefined ? { poster } : {}),
              };
            }),
          },
        };

  return {
    id: post.id,
    viewer: { liked: post.isLikedByMe === true, bookmarked: post.isBookmarkedByMe === true },
    isReel,
    author: {
      name: authorName,
      initials: initialsOf(authorName),
      accentColor: authorAccentColor(post.author?.id, authorName),
      ...(avatarSrc !== undefined ? { avatarSrc } : {}),
      ...(textOrUndefined(post.author?.username) !== undefined
        ? { username: textOrUndefined(post.author?.username) as string }
        : {}),
      ...(textOrUndefined(post.author?.id) !== undefined ? { id: textOrUndefined(post.author?.id) as string } : {}),
    },
    relativeTime: shortRelativeTime(new Date(post.createdAt), params.now),
    createdAt: new Date(post.createdAt).toISOString(),
    ...(repostOfHandle !== undefined ? { repostOfHandle } : {}),
    ...(text !== undefined ? { text } : {}),
    // `null` et `undefined` RETOMBENT tous deux sur « le serveur ne s'est pas
    // prononcé » : la passerelle sert `null` pour un champ optionnel absent
    // (doc-comment de `FeedAuthor`), et un `[]` fabriqué ici tuerait tous les
    // liens de mention d'une republication.
    ...(post.mentions === undefined || post.mentions === null
      ? {}
      : { validatedMentions: post.mentions.map((reference) => reference.username) }),
    media,
    ...(scene !== undefined ? { scene } : {}),
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
