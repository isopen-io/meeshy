import type { FeedAuthor, FeedPage, FeedPost } from './feed-pages';
import { minutesAgo } from './fixtures-base';
import { REEL_CLIP_BARS, REEL_CLIP_RGB, REEL_CLIP_VOICE } from './fixtures-reel-clips';

/**
 * LE CORPUS DU FIL EN FIXTURES (#5893) — servi par le MÊME chemin que la
 * passerelle (`loadFeedPage`), jamais par une branche de l'écran. Écrit pour
 * EXERCER chaque famille du § 3.4 de la spécification, pas pour faire joli.
 *
 * AUCUN auteur ne reprend Kwame/Amina/Fatou/Bruno — ces quatre noms sont les
 * PREUVES « ceci est une fixture » du socle (CLAUDE.md racine, § « DEUX
 * SIMULATEURS ») : les réutiliser ici brouillerait cette preuve sur l'écran
 * le plus peuplé de fixtures après la Lentille (même raison que
 * `fixtures-pagination.ts`).
 */
const feedAuthor = (id: string, displayName: string, username: string): FeedAuthor => ({ id, displayName, username });

const LEA: FeedAuthor = feedAuthor('u-feed-lea', 'Léa Dupont', 'lea.dupont');
const YANN: FeedAuthor = feedAuthor('u-feed-yann', 'Yann Petit', 'yann.petit');
const SOFIA: FeedAuthor = feedAuthor('u-feed-sofia', 'Sofia Ramos', 'sofia.ramos');
const OMAR: FeedAuthor = feedAuthor('u-feed-omar', 'Omar Haddad', 'omar.haddad');
const MEI: FeedAuthor = feedAuthor('u-feed-mei', 'Mei Lin', 'mei.lin');
const FILLER_AUTHORS: readonly FeedAuthor[] = [LEA, YANN, SOFIA, OMAR, MEI];

/**
 * UNE VRAIE SOURCE D'IMAGE, PAS UNE CHAÎNE VIDE (même correctif que
 * `fixtures-stories.ts` § `STORY_PHOTO_STAND_IN`) — un `data:` URI traverse
 * `resolveAttachmentSrc` inchangé et ne coûte aucune requête. `ratio` choisit
 * un cadrage carré (1:1, le défaut d'une carte de post) ou large (16:9, un
 * `REEL` portrait inversé pour la vignette).
 */
export function feedPhotoStandIn(topHex: string, bottomHex: string, ratio: 'square' | 'landscape' | 'portrait' | 'panorama'): string {
  const [w, h] = ratio === 'panorama' ? [160, 40] : ratio === 'landscape' ? [160, 90] : ratio === 'portrait' ? [90, 160] : [120, 120];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${topHex}"/><stop offset="1" stop-color="${bottomHex}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Deux ThumbHash RÉELS (3 octets, décodables par `lib/media/thumbhash.ts`) —
 * l'un ambré, l'autre bleuté ; voir le doc-comment du décodeur pour la
 * formule qui les produit. */
const THUMB_HASH_AMBER = 'LHkC';
const THUMB_HASH_BLUE = 'PAo8';

const feedPostDefaults = {
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
} as const;

/** `POST_IMAGE_FR` — original déjà dans la langue du lecteur, une seule image DIMENSIONNÉE. */
export const POST_IMAGE_FR: FeedPost = {
  ...feedPostDefaults,
  id: 'post-image-fr',
  type: 'POST',
  createdAt: minutesAgo(5),
  author: LEA,
  content: 'Le marché de ce matin, encore un peu endormi.',
  originalLanguage: 'fr',
  media: [
    {
      id: 'media-image-fr',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#f3b27a', '#6f7fd6', 'square'),
      thumbnailUrl: feedPhotoStandIn('#f3b27a', '#6f7fd6', 'square'),
      thumbHash: THUMB_HASH_AMBER,
      width: 1080,
      height: 1080,
      order: 0,
    },
  ],
  likeCount: 14,
  commentCount: 2,
};

/** `POST_IMAGE_EN_TRANSLATED` — original anglais, traduction française — le
 * témoin de RANG 1 (la traduction existe pour la langue première du lecteur). */
export const POST_IMAGE_EN_TRANSLATED: FeedPost = {
  ...feedPostDefaults,
  id: 'post-image-en-translated',
  type: 'POST',
  createdAt: minutesAgo(14),
  author: YANN,
  content: 'Best sunrise of the year, no filter.',
  originalLanguage: 'en',
  translations: { fr: { text: 'Le plus beau lever de soleil de l’année, sans filtre.' } },
  media: [
    {
      id: 'media-image-en',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#fcd34d', '#f97316', 'landscape'),
      thumbnailUrl: feedPhotoStandIn('#fcd34d', '#f97316', 'landscape'),
      thumbHash: THUMB_HASH_BLUE,
      width: 1600,
      height: 900,
      order: 0,
    },
  ],
  likeCount: 41,
  commentCount: 6,
};

/**
 * `POST_TEXT_RANK2` — le TÉMOIN DE RANG (leçon 261) : original espagnol,
 * traduction anglaise SEULEMENT (aucune française). Servi en anglais dès que
 * le prisme du lecteur porte `['fr', 'en', …]` — jamais l'espagnol, jamais
 * un repli sur `translations.first`.
 */
export const POST_TEXT_RANK2: FeedPost = {
  ...feedPostDefaults,
  id: 'post-text-rank2',
  type: 'POST',
  createdAt: minutesAgo(22),
  author: SOFIA,
  content: 'La reunión se traslada a las tres de la tarde.',
  originalLanguage: 'es',
  translations: { en: { text: 'The meeting is moved to three in the afternoon.' } },
  likeCount: 3,
};

/** `POST_CAROUSEL` — trois médias ORDONNÉS, chacun sa propre légende. */
export const POST_CAROUSEL: FeedPost = {
  ...feedPostDefaults,
  id: 'post-carousel',
  type: 'POST',
  createdAt: minutesAgo(31),
  author: OMAR,
  content: 'Trois vues du même sentier, à trois heures différentes.',
  originalLanguage: 'fr',
  media: [
    {
      id: 'media-carousel-1',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#34d399', '#0ea5e9', 'square'),
      thumbnailUrl: feedPhotoStandIn('#34d399', '#0ea5e9', 'square'),
      thumbHash: THUMB_HASH_AMBER,
      width: 1080,
      height: 1080,
      caption: 'Sept heures du matin.',
      order: 0,
    },
    {
      id: 'media-carousel-2',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#0ea5e9', '#6366f1', 'square'),
      thumbnailUrl: feedPhotoStandIn('#0ea5e9', '#6366f1', 'square'),
      thumbHash: THUMB_HASH_BLUE,
      width: 1080,
      height: 1080,
      caption: 'Midi, en plein soleil.',
      order: 1,
    },
    {
      id: 'media-carousel-3',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#6366f1', '#1e1b4b', 'square'),
      thumbnailUrl: feedPhotoStandIn('#6366f1', '#1e1b4b', 'square'),
      width: 1080,
      height: 1080,
      caption: 'Dix-neuf heures, la lumière tombe.',
      order: 2,
    },
  ],
  likeCount: 22,
  commentCount: 4,
};

/**
 * `POST_HERO` (#6514) — trois photos composées sur iOS « en hero » : l'agencement
 * voyage dans le document canvas v3 (`storyEffects.layout`), sans champ serveur.
 * La carte doit les poser en une grande tuile et deux satellites, jamais en
 * carrousel. La grande tuile porte sa légende, les satellites n'en ont pas la place.
 */
export const POST_HERO: FeedPost = {
  ...feedPostDefaults,
  id: 'post-hero',
  type: 'POST',
  createdAt: minutesAgo(34),
  author: MEI,
  content: 'Le marché flottant, vu du pont puis de la barque.',
  originalLanguage: 'fr',
  storyEffects: { v: 3, layout: 'hero' },
  media: [
    {
      id: 'media-hero-1',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#f59e0b', '#be123c', 'portrait'),
      thumbHash: THUMB_HASH_AMBER,
      width: 1080,
      height: 1920,
      caption: 'Depuis le pont, à l’aube.',
      order: 0,
    },
    {
      id: 'media-hero-2',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#0ea5e9', '#14b8a6', 'square'),
      thumbHash: THUMB_HASH_BLUE,
      width: 1080,
      height: 1080,
      order: 1,
    },
    {
      id: 'media-hero-3',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#6366f1', '#a855f7', 'square'),
      width: 1080,
      height: 1080,
      order: 2,
    },
  ],
  likeCount: 17,
  commentCount: 2,
};

/** `POST_LONG_TEXT` — 24 mots, exerce le seuil de troncature à 20. */
export const POST_LONG_TEXT: FeedPost = {
  ...feedPostDefaults,
  id: 'post-long-text',
  type: 'POST',
  createdAt: minutesAgo(40),
  author: MEI,
  content:
    'Ce matin j’ai relu mes notes de la semaine dernière et je me rends compte que trois idées méritaient vraiment d’être creusées davantage avant la réunion.',
  originalLanguage: 'fr',
  likeCount: 8,
};

/** `POST_REPOST` — attribution de republication, `repostOf.author.username`. */
export const POST_REPOST: FeedPost = {
  ...feedPostDefaults,
  id: 'post-repost',
  type: 'POST',
  createdAt: minutesAgo(48),
  author: LEA,
  content: 'Tout à fait d’accord avec ça.',
  originalLanguage: 'fr',
  repostOf: { author: { username: 'yann.petit' } },
  likeCount: 5,
};

/** `REEL_PORTRAIT` — plein cadre, portrait, sans texte de corps hors légende. */
export const REEL_PORTRAIT: FeedPost = {
  ...feedPostDefaults,
  id: 'reel-portrait',
  type: 'REEL',
  createdAt: minutesAgo(56),
  author: YANN,
  content: 'Trente secondes de la répétition de ce soir.',
  originalLanguage: 'fr',
  media: [
    {
      id: 'media-reel-1',
      /* UN CLIP DÉCODABLE (#6457) : toucher ce réel ouvre le lecteur des Réels,
         qui le JOUE — une image SVG servie pour une vidéo y aurait peint
         « Lecture impossible » sur le premier réel de toute recette. */
      mimeType: 'video/webm',
      fileUrl: REEL_CLIP_BARS,
      thumbnailUrl: feedPhotoStandIn('#1e1b4b', '#4338ca', 'portrait'),
      thumbHash: THUMB_HASH_BLUE,
      width: 1080,
      height: 1920,
      duration: 28,
      order: 0,
    },
  ],
  likeCount: 63,
  commentCount: 11,
};

/** `POST_NO_DIMENSIONS` — un média SANS `width`/`height` servies. */
export const POST_NO_DIMENSIONS: FeedPost = {
  ...feedPostDefaults,
  id: 'post-no-dimensions',
  type: 'POST',
  createdAt: minutesAgo(63),
  author: SOFIA,
  content: 'Un aperçu, avant que le format ne soit confirmé.',
  originalLanguage: 'fr',
  media: [
    {
      id: 'media-no-dims',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#94a3b8', '#334155', 'square'),
      order: 0,
    },
  ],
  likeCount: 1,
};

/**
 * `POST_WIRE_NULLS` — LA CHARGE TELLE QUE LA PASSERELLE LA SERT, `null`
 * compris (défaut BLOQUANT, revue-correction #5893). Relevé le 2026-09-13 sur
 * `gate.staging.meeshy.me` (`GET /api/v1/social/posts?scope=home`) : un
 * auteur sans photo sert `avatar: null`, un média sans vignette sert
 * `thumbnailUrl`/`thumbHash`/`caption`/`width`/`height`/`duration` à `null` —
 * Prisma sérialise une colonne optionnelle, jamais une clé absente.
 *
 * Les huit autres posts de ce corpus n'écrivaient que des clés ABSENTES :
 * l'écran levait donc une `TypeError` sur la donnée réelle pendant que tous
 * les témoins restaient verts. Un corpus de fixtures qui ne mime pas la FORME
 * du fil (§ « LES FIXTURES MIMENT LA PASSERELLE », socle) n'est pas un corpus,
 * c'est un décor.
 */
export const POST_WIRE_NULLS: FeedPost = {
  ...feedPostDefaults,
  id: 'post-wire-nulls',
  type: 'POST',
  createdAt: minutesAgo(66),
  author: { id: 'u-feed-nulls', displayName: 'Ana Ferreira', username: 'ana.ferreira', avatar: null },
  content: 'Aucune photo de profil, aucune vignette, aucune légende — et pourtant ça se lit.',
  originalLanguage: 'fr',
  translations: null,
  media: [
    {
      id: 'media-wire-nulls',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#a5b4fc', '#4338ca', 'square'),
      thumbnailUrl: null,
      thumbHash: null,
      width: null,
      height: null,
      duration: null,
      caption: null,
      alt: null,
      order: null,
    },
  ],
  likeCount: null,
  commentCount: null,
};

/**
 * **`POST_VIDEO` — UNE VIDÉO DE POST, QUI SE JOUE DANS LE FIL** (#6807).
 *
 * Distincte de `REEL_PORTRAIT` par la DÉCISION qu'elle exerce : l'affiche
 * d'un RÉEL reste immobile dans le fil (#6457, la lecture appartient au
 * lecteur des Réels), tandis qu'une vidéo de POST se joue sur place
 * (#6800, `FeedMediaSurface` montée `playable`). Le corpus ne portait que la
 * première, donc la seconde règle n'était jouée par AUCUNE recette : mesuré
 * au navigateur le 2026-09-16, `/feed` montait 13 `<img>` et zéro `<video>`.
 *
 * Le clip est RÉELLEMENT décodable (`REEL_CLIP_RGB`, VP8) : une image servie
 * sous un `mimeType` vidéo peindrait « Lecture impossible » sur la seule
 * carte censée prouver qu'une vidéo se joue.
 */
export const POST_VIDEO: FeedPost = {
  ...feedPostDefaults,
  id: 'post-video',
  type: 'POST',
  createdAt: minutesAgo(52),
  author: SOFIA,
  content: 'Le couloir du studio, en trois secondes.',
  originalLanguage: 'fr',
  media: [
    {
      id: 'media-video',
      mimeType: 'video/webm',
      fileUrl: REEL_CLIP_RGB,
      thumbnailUrl: feedPhotoStandIn('#0f766e', '#14b8a6', 'square'),
      width: 1920,
      height: 1080,
      /** MILLISECONDES (`FeedMedia.duration`) — trois secondes, la durée
       * réelle du clip, pour que la pastille dise vrai. */
      duration: 3000,
      order: 0,
    },
  ],
  likeCount: 17,
  commentCount: 2,
};

/**
 * **`POST_AUDIO` — UN SON DE POST** (#6807). Le corpus n'en portait AUCUN :
 * la branche `audio` de `FeedMediaSurface` — forme d'onde et `<audio>` monté
 * quand l'hôte la déclare `playable` — n'avait donc aucune donnée pour
 * exister, ni en recette, ni sous un œil humain.
 *
 * SANS dimensions ni vignette, comme un son l'est : c'est `postMediaRatio`
 * qui décide alors du cadre, exactement comme pour `POST_NO_DIMENSIONS`.
 */
export const POST_AUDIO: FeedPost = {
  ...feedPostDefaults,
  id: 'post-audio',
  type: 'POST',
  createdAt: minutesAgo(58),
  author: LEA,
  content: 'Deux secondes de la répétition, au casque.',
  originalLanguage: 'fr',
  media: [
    {
      id: 'media-audio',
      mimeType: 'audio/webm',
      fileUrl: REEL_CLIP_VOICE,
      duration: 2008,
      order: 0,
    },
  ],
  likeCount: 9,
};

/**
 * **LE VECTEUR QUI SÉPARE** une règle de légende juste d'un `?? post.content`
 * naïf (#6864) — TROIS médias dont **un seul** porte sa légende propre.
 *
 * Aucun autre post du corpus ne l'exerce, et ce n'est pas un oubli :
 * `POST_CAROUSEL` a trois médias et trois légendes (chacun garde la sienne, un
 * repli fautif ne se verrait pas), `POST_HERO` en a trois pour une légende mais
 * en layout `hero`, où `tileCarriesCaption` ne laisse peindre QUE la tuile 0 —
 * les deux autres ne montreraient rien de toute façon, et le gate mesurerait la
 * PLACE en croyant mesurer l'ORIGINE.
 *
 * D'où le layout `reel` : c'est le SEUL mode tuilé où `tileCarriesCaption`
 * rend vrai pour TOUTES les tuiles (`hero` ne peint que la tuile 0, `wave` et
 * `sine` aucune). Les trois pièces sont donc dans le DOM en même temps, et un
 * repli non borné y poserait le contenu du post sous les pièces 2 et 3 quand
 * la règle juste les laisse nues.
 *
 * Le `carousel` — le défaut — ne conviendrait PAS, et pour une raison qui n'a
 * rien à voir avec la légende : il ne monte qu'UNE page à la fois
 * (`FeedMediaCarousel`, `current = media[clamped]`). Les pièces 2 et 3
 * n'existeraient pas dans le DOM au repos, et l'invariante mesurerait leur
 * absence de légende sans rien prouver — elles sont absentes tout court.
 *
 * DATÉ `minutesAgo(68)`, dans l'interstice mesuré entre le dernier post nommé
 * (66) et le premier remplissage (70) : il ne prend pas la tête du fil — que
 * `check-floating-clearance` va chercher par `querySelector('[data-feed-card]')`
 * — et ne déplace aucune carte existante. Auteur DÉJÀ présent, pour ne toucher
 * aucun compteur d'auteur.
 */
export const POST_LEGENDE_MIXTE: FeedPost = {
  ...feedPostDefaults,
  id: 'post-legende-mixte',
  type: 'POST',
  createdAt: minutesAgo(68),
  author: OMAR,
  content: 'Trois prises du même plateau, une seule légendée.',
  originalLanguage: 'fr',
  storyEffects: { v: 3, layout: 'reel' },
  media: [
    {
      id: 'media-mixte-1',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#0ea5e9', '#6366f1', 'square'),
      thumbnailUrl: feedPhotoStandIn('#0ea5e9', '#6366f1', 'square'),
      width: 1080,
      height: 1080,
      caption: 'La première, au grand angle.',
      order: 0,
    },
    {
      id: 'media-mixte-2',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#f59e0b', '#ef4444', 'square'),
      thumbnailUrl: feedPhotoStandIn('#f59e0b', '#ef4444', 'square'),
      width: 1080,
      height: 1080,
      order: 1,
    },
    {
      id: 'media-mixte-3',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#10b981', '#14b8a6', 'square'),
      thumbnailUrl: feedPhotoStandIn('#10b981', '#14b8a6', 'square'),
      width: 1080,
      height: 1080,
      order: 2,
    },
  ],
  likeCount: 6,
  commentCount: 1,
};

/**
 * `TRANSFORM_EMPTY` — le `transform: {}` MESURÉ en base (staging, post
 * « Trois scènes — mesure des dispositions », §3.3 de la spécification
 * `scenes-fil`, #6898) : `CANVAS_V3_WRITE_STRICT` n'étant pas armé, un objet
 * peut porter un transform PARTIEL ou VIDE — `parseCanvasDocument`
 * (`lib/canvas/document.ts`) le lit avec les défauts `{1, 0, 1}`, jamais un
 * rejet. `TRANSFORM_FULL` exerce l'autre moitié du corpus réel (un objet
 * qui écrit les trois champs).
 */
const TRANSFORM_EMPTY = {} as const;
/** `export` (#6903) — `fixtures-reels.ts#REEL_SCENE_LOOP` en a besoin pour
 * composer un document canvas v3 valide, sans dupliquer ce littéral. */
export const TRANSFORM_FULL = { scale: 1, rotation: 0, opacity: 1 } as const;

/**
 * `POST_SCENE_TEXT` — UNE SCÈNE, ZÉRO MÉDIA (#6898, § 3.4 T1/critère 1) :
 * texte seul sur fond de couleur, `transform: {}` (tolérance de contrat,
 * § 3.3). Servi au RANG 2 du prisme fixtures `['fr','en']` — la traduction
 * française est ABSENTE, jamais un repli sur l'original espagnol.
 */
export const POST_SCENE_TEXT: FeedPost = {
  ...feedPostDefaults,
  id: 'post-scene-text',
  type: 'POST',
  createdAt: minutesAgo(3),
  author: SOFIA,
  originalLanguage: 'fr',
  storyEffects: {
    v: 3,
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 'bg1',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: TRANSFORM_EMPTY,
            payload: { background: '#4338CA' },
          },
          {
            id: 't1',
            kind: 'text',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 1,
            transform: TRANSFORM_EMPTY,
            locale: 'es',
            payload: { text: 'La escena habla sola.', translations: { en: 'The scene speaks for itself.', de: 'Die Szene spricht für sich.' } },
          },
        ],
      },
    ],
  },
};

/**
 * `POST_SCENES_MIXED` — TROIS SCÈNES, DEUX MÉDIAS, `layout` ABSENT (⇒
 * carrousel) — critère 2 (page texte seul, ni image ni légende du post) et
 * critère 3 (le plafond 1,4 : la page portrait vote 9:16, la plus haute).
 */
export const POST_SCENES_MIXED: FeedPost = {
  ...feedPostDefaults,
  id: 'post-scenes-mixed',
  type: 'POST',
  createdAt: minutesAgo(7),
  author: OMAR,
  // Le texte du post AU-DESSUS de la boîte, comme la cible (`RECETTE C`,
  // `scenes-fil.light.png`) : sans lui, la hiérarchie « texte puis scène »
  // n'était exercée par aucune carte du corpus.
  content: 'Trois scènes : un panorama, une page de texte, un portrait.',
  originalLanguage: 'fr',
  storyEffects: {
    v: 3,
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 'bg1',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: TRANSFORM_FULL,
            payload: { mediaId: 'media-scene-pano', aspectRatio: 4 },
          },
          {
            id: 't1',
            kind: 'text',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 1,
            transform: TRANSFORM_FULL,
            locale: 'fr',
            payload: { text: 'Panorama', textColor: '#FFFFFF' },
          },
        ],
      },
      {
        id: 's2',
        objects: [
          {
            id: 'bg2',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: TRANSFORM_FULL,
            payload: { background: '#4338CA' },
          },
          {
            id: 't2',
            kind: 'text',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 1,
            transform: TRANSFORM_FULL,
            locale: 'fr',
            payload: { text: 'Deuxième page, texte seul', textColor: '#FFFFFF' },
          },
        ],
      },
      {
        id: 's3',
        objects: [
          {
            id: 'bg3',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: TRANSFORM_FULL,
            payload: { postMediaId: 'media-scene-portrait', aspectRatio: 0.5625 },
          },
        ],
      },
    ],
  },
  media: [
    {
      id: 'media-scene-pano',
      mimeType: 'image/svg+xml',
      // 4:1 comme le fichier que la passerelle sert (1600×400) et comme
      // l'`aspectRatio: 4` que la scène déclare — un stand-in 16:9 derrière
      // une déclaration 4:1 peignait une bande que la loi de cadrage ne
      // décrivait pas (revue-correction #6898).
      fileUrl: feedPhotoStandIn('#ef4444', '#991b1b', 'panorama'),
      width: 1600,
      height: 400,
      order: 0,
    },
    {
      id: 'media-scene-portrait',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#1e293b', '#0f172a', 'portrait'),
      width: 900,
      height: 1600,
      order: 1,
    },
  ],
};

/**
 * `POST_SCENES_WAVE` — CINQ SCÈNES TEXTE SEUL, `layout: 'wave'` — critère
 * (5.6.5, gate) : 4 tuiles + `+1`, AUCUNE légende (`wave` n'en porte sur
 * aucune tuile, `tileCarriesCaption`).
 */
export const POST_SCENES_WAVE: FeedPost = {
  ...feedPostDefaults,
  id: 'post-scenes-wave',
  type: 'POST',
  createdAt: minutesAgo(12),
  author: MEI,
  originalLanguage: 'fr',
  storyEffects: {
    v: 3,
    layout: 'wave',
    scenes: Array.from({ length: 5 }, (_, i) => ({
      id: `s${i + 1}`,
      objects: [
        {
          id: `bg${i + 1}`,
          kind: 'media',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'bg',
          z: 0,
          transform: TRANSFORM_FULL,
          payload: { background: i % 2 === 0 ? '#0EA5E9' : '#7C3AED' },
        },
        {
          id: `t${i + 1}`,
          kind: 'text',
          anchor: { t: 'free', x: 0.5, y: 0.5 },
          plane: 'fg',
          z: 1,
          transform: TRANSFORM_FULL,
          locale: 'fr',
          payload: { text: `SCÈNE ${i + 1}`, textColor: '#FFFFFF' },
        },
      ],
    })),
  },
};

const sceneClip = (id: string, fileUrl: string, muted: boolean, sound: boolean) => ({
  ...feedPostDefaults,
  id,
  type: 'POST',
  createdAt: minutesAgo(0),
  author: YANN,
  // Un média SEUL sans légende : le cas exact où `resolveMedia` PRÊTE le
  // contenu du post comme légende (#6864). Sur une carte à scène, ce texte
  // reste au-dessus et ne descend jamais en bandeau (gate § 4).
  ...(id === 'post-scene-clip-a' ? { content: 'Avec le son, en boucle' } : {}),
  originalLanguage: 'fr',
  storyEffects: {
    v: 3,
    ...(sound ? { sound: { source: { t: 'original' as const }, volume: 1 } } : {}),
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 'bg1',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: TRANSFORM_FULL,
            payload: { postMediaId: `media-${id}`, mediaType: 'video/webm', ...(muted ? { muted: true } : {}) },
          },
          {
            id: 't1',
            kind: 'text',
            anchor: { t: 'free', x: 0.5, y: 0.12 },
            plane: 'fg',
            z: 1,
            transform: TRANSFORM_FULL,
            locale: 'fr',
            payload: { text: id === 'post-scene-clip-a' ? 'Avec le son' : 'Muet', textColor: '#FFFFFF' },
          },
        ],
      },
    ],
  },
  // `thumbHash` : une vidéo RÉELLE porte quasi toujours une vignette — sans
  // elle ici, le défaut de revue #6898 (fond vidéo transparent tant que rien
  // n'a joué, `preload="none"`) restait invisible au gate, qui n'avait rien
  // à vérifier. `THUMB_HASH_AMBER`/`BLUE` (déjà utilisées plus haut).
  media: [{ id: `media-${id}`, mimeType: 'video/webm', fileUrl, order: 0, thumbHash: id === 'post-scene-clip-a' ? THUMB_HASH_AMBER : THUMB_HASH_BLUE }],
} satisfies FeedPost);

/**
 * `POST_SCENE_CLIP_A`/`B` — DEUX SCÈNES CINÉMATIQUES ADJACENTES (critère 4,
 * gate) : une seule joue à la fois, `a` porte le son (`storyEffects.sound`),
 * `b` est `muted: true` (`SceneMotion.isAudible` la rend NON audible).
 * Datées PLUS ANCIENNES que `POST_VIDEO` (52 min) et `POST_AUDIO` (58 min) :
 * `check-feed-media.mjs:111` doit continuer d'atteindre d'abord LEUR vidéo à
 * elles sur une carte de POST — préfixé `[data-feed-media]` par ce lot
 * (§ 5.6), donc sans collision, mais l'ordre est conservé par prudence.
 */
export const POST_SCENE_CLIP_A: FeedPost = { ...sceneClip('post-scene-clip-a', REEL_CLIP_BARS, false, true), createdAt: minutesAgo(60) };
export const POST_SCENE_CLIP_B: FeedPost = { ...sceneClip('post-scene-clip-b', REEL_CLIP_RGB, true, false), createdAt: minutesAgo(61) };

/**
 * `POST_SCENE_DECORATED` (#6901, T-F, D10) — UNE scène qui exerce CINQ des
 * sept couches du moteur d'un coup : fond image (`fit`), texte à KEYFRAMES
 * (`check-feed-scenes.mjs` prouve l'EFFET — deux relevés espacés de 700 ms
 * diffèrent), sticker emoji, lieu et dessin. Les deux qui MANQUENT, et
 * l'aveu se tient ici plutôt que dans un rapport (revue-correction #6901,
 * le doc-comment disait « les SIX couches » et en listait cinq) : un média
 * POSÉ (non-fond, 65 % du petit côté) — exercé par `media-size.test.ts` et
 * par T-E3 au DOM, jamais au NAVIGATEUR, donc son rendu `cqw` réel n'a pas
 * de témoin ; et un audio d'OVERLAY — exercé par T-E11 seulement. Datée PLUS
 * RÉCENTE
 * que `POST_LEGENDE_MIXTE` (`minutesAgo(68)`) et distincte des cinq autres
 * scènes (`3`/`7`/`12`/`60`/`61`) — l'invariant du doc-comment de
 * `FILLER_POSTS` (70 > 68 > tout post nommé) tient toujours.
 */
export const POST_SCENE_DECORATED: FeedPost = {
  ...feedPostDefaults,
  id: 'post-scene-decorated',
  type: 'POST',
  createdAt: minutesAgo(64),
  author: MEI,
  content: 'Une scène complète : fond, texte animé, sticker, lieu, dessin.',
  originalLanguage: 'fr',
  storyEffects: {
    v: 3,
    scenes: [
      {
        id: 's1',
        objects: [
          {
            id: 'bg1',
            kind: 'media',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'bg',
            z: 0,
            transform: TRANSFORM_FULL,
            payload: {
              postMediaId: 'media-scene-decorated',
              mediaType: 'image/svg+xml',
              aspectRatio: 16 / 9,
              // `thumbHash` (revue-correction #6901) — SANS lui, le fond
              // AJUSTÉ (`videoFitMode: 'fit'`) ne laissait rien peindre les
              // bandes : `letterboxHashes` ne trouvait AUCUNE source, et la
              // scène laissait voir l'aplat de CARTE au lieu d'être un canvas
              // opaque. Un média RÉEL en porte quasi toujours un (généré à
              // l'upload) — cette fixture exerce donc le cas NOMINAL, celui
              // qu'iOS sert par défaut (`servesLetterboxFill: true`).
              thumbHash: THUMB_HASH_AMBER,
              transform: { videoFitMode: 'fit' },
            },
          },
          {
            id: 't1',
            kind: 'text',
            anchor: { t: 'free', x: 0.2, y: 0.2 },
            plane: 'fg',
            z: 1,
            transform: TRANSFORM_FULL,
            locale: 'fr',
            // `end: 2` (et non `timelineDuration` sur la scène) : la fin
            // RÉSOLUE de cet objet EST la durée de la scène —
            // `sceneDurationSeconds` (`lib/canvas/timeline.ts`) la retrouve
            // sans qu'aucune durée ne soit posée au niveau de la scène (§ 8
            // de la spécification #6901 : « pas de timelineDuration ⇒
            // sceneDurationSeconds = max end = 2 s »). En mode `card`
            // (boucle), le texte anime en continu entre les deux keyframes —
            // c'est l'EFFET qu'un gate navigateur observe (deux relevés
            // espacés de 700 ms qui diffèrent), jamais son seul câblage.
            timing: { start: 0, end: 2, keyframes: [{ time: 0, x: 0.2, y: 0.2 }, { time: 2, x: 0.8, y: 0.2, easing: 'easeInOut' }] },
            // `textBg` — la pastille SOLIDE derrière le texte
            // (`scene-object-text.tsx`), le seul chemin du moteur qu'aucune
            // fixture n'exerçait. Elle n'est pas là pour la couverture :
            // SANS elle, un texte BLANC posé sur les bandes d'un fond
            // `fit` se peignait sur l'aplat de carte — donc INVISIBLE en
            // schéma CLAIR, parfaitement lisible en sombre (regardé au
            // premier passage, revue-correction #6901). La cause profonde —
            // les bandes d'un fond ajusté n'étaient pas habillées sur la
            // carte de fil alors qu'iOS les sert par défaut
            // (`servesLetterboxFill: true`, `FeedSceneAutoplay.swift:159`
            // n'en passe aucune) — est désormais RÉSOLUE dans le moteur
            // (`scene-player.tsx#SceneCanvas`, `bg1.payload.thumbHash`
            // ci-dessus) ; la pastille RESTE, en défense en profondeur —
            // le sol se peint à `LETTERBOX_FILL_OPACITY` (0,85), jamais 1.
            payload: { text: 'Ça bouge !', textColor: '#FFFFFF', textBg: '#4338CA' },
          },
          {
            id: 'sticker1',
            kind: 'sticker',
            anchor: { t: 'free', x: 0.8, y: 0.8 },
            plane: 'fg',
            z: 2,
            transform: TRANSFORM_FULL,
            payload: { emoji: '🔥', baseSize: 200 },
          },
          {
            id: 'place1',
            kind: 'place',
            anchor: { t: 'band', edge: 'bottom' },
            plane: 'fg',
            z: 3,
            transform: TRANSFORM_FULL,
            payload: { place: { name: 'Café Central', address: '12 rue de la Paix' } },
          },
          {
            id: 'drawing1',
            kind: 'drawing',
            anchor: { t: 'free', x: 0.5, y: 0.5 },
            plane: 'fg',
            z: 4,
            transform: TRANSFORM_FULL,
            payload: {
              strokes: [
                { points: [{ x: 100, y: 100 }, { x: 400, y: 300 }, { x: 700, y: 150 }], width: 6, tool: 'pen', colorHex: 'FF3B30' },
                { points: [{ x: 200, y: 900 }, { x: 800, y: 1000 }], width: 10, tool: 'marker', colorHex: '4338CA' },
              ],
            },
          },
        ],
      },
    ],
  },
  media: [
    {
      id: 'media-scene-decorated',
      mimeType: 'image/svg+xml',
      fileUrl: feedPhotoStandIn('#f59e0b', '#ef4444', 'landscape'),
      thumbHash: THUMB_HASH_AMBER,
      width: 1600,
      height: 900,
      order: 0,
    },
  ],
} satisfies FeedPost;

const NAMED_POSTS: readonly FeedPost[] = [
  POST_IMAGE_FR,
  POST_IMAGE_EN_TRANSLATED,
  POST_TEXT_RANK2,
  POST_CAROUSEL,
  POST_HERO,
  POST_LONG_TEXT,
  POST_REPOST,
  REEL_PORTRAIT,
  POST_VIDEO,
  POST_AUDIO,
  POST_NO_DIMENSIONS,
  POST_WIRE_NULLS,
  POST_LEGENDE_MIXTE,
  POST_SCENE_TEXT,
  POST_SCENES_MIXED,
  POST_SCENES_WAVE,
  POST_SCENE_CLIP_A,
  POST_SCENE_CLIP_B,
  POST_SCENE_DECORATED,
];

/**
 * DES POSTS DE REMPLISSAGE (#5893) — pour qu'une page 2 existe (limite 20) :
 * `NAMED_POSTS` (19, depuis #6901 — la scène décorée aux six couches
 * s'ajoute aux cinq scènes de #6898) + 18 remplissages = 37, strictement
 * plus vieux que le dernier des `NAMED_POSTS` (`minutesAgo(68)`,
 * `POST_LEGENDE_MIXTE` — les six scènes sont toutes datées entre 3 et 64
 * minutes, donc plus RÉCENTES, jamais en tête de ce calcul).
 *
 * Ces DEUX nombres avaient dérivé — la prose disait « (8) » et
 * « `minutesAgo(63)` » alors que le corpus portait déjà douze posts nommés
 * dont le plus ancien à 66 minutes. L'invariant qu'elle décrit restait vrai
 * (70 > 66), mais sa justification était fausse : un doc-comment de CARDINALITÉ
 * se périme en silence à chaque ajout, puisque rien ne le relit. Le recompter
 * au moment d'ajouter est le seul instant où l'écart se voit.
 */
const FILLER_POSTS: readonly FeedPost[] = Array.from({ length: 18 }, (_, i) => {
  const author = FILLER_AUTHORS[i % FILLER_AUTHORS.length]!;
  return {
    ...feedPostDefaults,
    id: `post-filler-${String(i + 1).padStart(2, '0')}`,
    type: 'POST',
    createdAt: minutesAgo(70 + i * 8),
    author,
    content: `Publication numéro ${i + 1} du fil, pour peupler la page suivante.`,
    originalLanguage: 'fr',
    likeCount: i,
  } satisfies FeedPost;
});

export const FEED_POSTS: readonly FeedPost[] = [...NAMED_POSTS, ...FILLER_POSTS];

const timeOf = (value: string | Date): number => new Date(value).getTime();

/** Curseur OPAQUE des fixtures — jamais lu ailleurs qu'ici : `pageOfFeed` le
 * fabrique, `loadFeedPage` le retransmet TEL QUEL au tour suivant, exactement
 * comme la passerelle réelle (`encodeCursor`/`decodeCursor`,
 * `utils/keyset-cursor.ts`) — la FORME du curseur peut diverger du serveur
 * sans que rien ne s'en soucie, les fixtures ne parlent jamais à la
 * passerelle. */
function encodeFeedCursor(createdAtMs: number, id: string): string {
  return btoa(`${createdAtMs}|${id}`);
}

function decodeFeedCursor(cursor: string): { readonly createdAtMs: number; readonly id: string } | null {
  try {
    const [createdAtRaw, id] = atob(cursor).split('|');
    const createdAtMs = Number(createdAtRaw);
    if (id === undefined || Number.isNaN(createdAtMs)) return null;
    return { createdAtMs, id };
  } catch {
    return null;
  }
}

/**
 * `pageOfFeed` — mime le keyset `(createdAt desc, id desc)` de `PostFeedService.getFeed`
 * (§ 3.1 de la spécification) : un curseur INCONNU laisse la fenêtre
 * INTACTE (reserre la page 1), `hasMore = page.length === limit`, TOUJOURS.
 * PURE, sans horloge : le corpus et l'instant sont REÇUS, jamais lus.
 */
export function pageOfFeed(
  corpus: readonly FeedPost[],
  params: { readonly cursor?: string; readonly limit: number },
): FeedPage {
  const { cursor, limit } = params;
  const sorted = [...corpus].sort((a, b) => {
    const byTime = timeOf(b.createdAt) - timeOf(a.createdAt);
    if (byTime !== 0) return byTime;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  const cursorAt = cursor === undefined ? null : decodeFeedCursor(cursor);
  const windowed =
    cursorAt === null
      ? sorted
      : sorted.filter((p) => {
          const t = timeOf(p.createdAt);
          if (t !== cursorAt.createdAtMs) return t < cursorAt.createdAtMs;
          return p.id < cursorAt.id;
        });

  const page = windowed.slice(0, limit);
  const hasMore = page.length === limit;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last !== undefined ? encodeFeedCursor(timeOf(last.createdAt), last.id) : null;

  return { posts: page, pagination: { limit, hasMore, nextCursor } };
}
