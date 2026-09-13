import type { FeedAuthor, FeedPage, FeedPost } from './feed-pages';
import { minutesAgo } from './fixtures-base';

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
function feedPhotoStandIn(topHex: string, bottomHex: string, ratio: 'square' | 'landscape' | 'portrait'): string {
  const [w, h] = ratio === 'landscape' ? [160, 90] : ratio === 'portrait' ? [90, 160] : [120, 120];
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
      mimeType: 'video/mp4',
      fileUrl: feedPhotoStandIn('#1e1b4b', '#4338ca', 'portrait'),
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

const NAMED_POSTS: readonly FeedPost[] = [
  POST_IMAGE_FR,
  POST_IMAGE_EN_TRANSLATED,
  POST_TEXT_RANK2,
  POST_CAROUSEL,
  POST_LONG_TEXT,
  POST_REPOST,
  REEL_PORTRAIT,
  POST_NO_DIMENSIONS,
  POST_WIRE_NULLS,
];

/**
 * DES POSTS DE REMPLISSAGE (#5893) — pour qu'une page 2 existe (limite 20) :
 * `NAMED_POSTS` (8) + 18 remplissages = 26, strictement plus vieux que le
 * dernier des `NAMED_POSTS` (`minutesAgo(63)`).
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
