import type { FeedAuthor, FeedPage, FeedPost } from './feed-pages';
import { minutesAgo } from './fixtures-base';
import { feedPhotoStandIn, pageOfFeed } from './fixtures-feed';
import { REEL_CLIP_BARS, REEL_CLIP_RGB, REEL_CLIP_VOICE } from './fixtures-reel-clips';

/**
 * LE CORPUS DES RÉELS EN FIXTURES (#6457) — servi par le MÊME chemin que la
 * passerelle (`loadReelsPage`), pour EXERCER chaque famille qu'accepte le type
 * `REEL` (`schema.prisma` : vidéo, audio ou au moins deux images) et le Prisme de
 * la légende (rang 1 et rang 2, leçon 261).
 *
 * Aucun auteur ne reprend Kwame/Amina/Fatou/Bruno, les preuves « ceci est une
 * fixture » du socle — même règle que `fixtures-feed.ts`.
 */
const reelAuthor = (id: string, displayName: string, username: string): FeedAuthor => ({ id, displayName, username, avatar: null });

const NADIA = reelAuthor('u-reel-nadia', 'Nadia Benali', 'nadia.benali');
const THEO = reelAuthor('u-reel-theo', 'Théo Marchand', 'theo.marchand');
const LINA = reelAuthor('u-reel-lina', 'Lina Okafor', 'lina.okafor');
const IVAN = reelAuthor('u-reel-ivan', 'Ivan Petrov', 'ivan.petrov');

const counts = { likeCount: 0, commentCount: 0, repostCount: 0, bookmarkCount: 0, shareCount: 0 } as const;

const portrait = { width: 1080, height: 1920 } as const;

/** Vidéo, légende déjà dans la langue du lecteur. */
export const REEL_STUDIO: FeedPost = {
  ...counts,
  id: 'reel-studio',
  type: 'REEL',
  createdAt: minutesAgo(9),
  author: NADIA,
  content: 'Premier essai de la chorégraphie, on garde le rythme.',
  originalLanguage: 'fr',
  media: [{ id: 'media-reel-studio', mimeType: 'video/webm', fileUrl: REEL_CLIP_BARS, thumbnailUrl: feedPhotoStandIn('#312e81', '#6366f1', 'portrait'), duration: 3000, order: 0, ...portrait }],
  likeCount: 128,
  commentCount: 14,
  isLikedByMe: false,
  isBookmarkedByMe: false,
};

/** Vidéo, original anglais, traduction française — rang 1 du Prisme. */
export const REEL_SUNSET_EN: FeedPost = {
  ...counts,
  id: 'reel-sunset-en',
  type: 'REEL',
  createdAt: minutesAgo(31),
  author: THEO,
  content: 'Golden hour on the harbour, sound on.',
  originalLanguage: 'en',
  translations: { fr: { text: 'L’heure dorée sur le port, avec le son.' } },
  media: [{ id: 'media-reel-sunset', mimeType: 'video/webm', fileUrl: REEL_CLIP_RGB, thumbnailUrl: feedPhotoStandIn('#f59e0b', '#be123c', 'portrait'), duration: 3000, order: 0, ...portrait }],
  likeCount: 57,
  bookmarkCount: 9,
  isLikedByMe: false,
  isBookmarkedByMe: true,
};

/** Deux images — la composition qualifiante sans lecteur de média. */
export const REEL_MARKET_IMAGES: FeedPost = {
  ...counts,
  id: 'reel-market-images',
  type: 'REEL',
  createdAt: minutesAgo(48),
  author: LINA,
  content: 'Deux étals, deux ambiances.',
  originalLanguage: 'fr',
  media: [
    { id: 'media-reel-market-1', mimeType: 'image/svg+xml', fileUrl: feedPhotoStandIn('#14532d', '#84cc16', 'portrait'), order: 0, ...portrait },
    { id: 'media-reel-market-2', mimeType: 'image/svg+xml', fileUrl: feedPhotoStandIn('#7c2d12', '#fb923c', 'portrait'), order: 1, ...portrait },
  ],
  likeCount: 22,
  isLikedByMe: true,
  isBookmarkedByMe: false,
};

/** Audio — un vocal publié en réel. */
export const REEL_VOICE: FeedPost = {
  ...counts,
  id: 'reel-voice',
  type: 'REEL',
  createdAt: minutesAgo(75),
  author: IVAN,
  content: 'Deux secondes de la note tenue à la répétition.',
  originalLanguage: 'fr',
  media: [{ id: 'media-reel-voice', mimeType: 'audio/webm', fileUrl: REEL_CLIP_VOICE, duration: 2000, order: 0 }],
  likeCount: 8,
};

/** Vidéo, original espagnol, traduction ANGLAISE seule — le témoin de rang 2. */
export const REEL_RANK2_ES: FeedPost = {
  ...counts,
  id: 'reel-rank2-es',
  type: 'REEL',
  createdAt: minutesAgo(96),
  author: LINA,
  content: 'El ensayo empieza a las ocho en punto.',
  originalLanguage: 'es',
  translations: { en: { text: 'Rehearsal starts at eight sharp.' } },
  media: [{ id: 'media-reel-rank2', mimeType: 'video/webm', fileUrl: REEL_CLIP_BARS, thumbnailUrl: feedPhotoStandIn('#0c4a6e', '#22d3ee', 'portrait'), duration: 3000, order: 0, ...portrait }],
  likeCount: 3,
};

/** Vidéo sans légende. */
export const REEL_CITY_SILENT: FeedPost = {
  ...counts,
  id: 'reel-city-silent',
  type: 'REEL',
  createdAt: minutesAgo(130),
  author: THEO,
  content: null,
  originalLanguage: null,
  media: [{ id: 'media-reel-city', mimeType: 'video/webm', fileUrl: REEL_CLIP_RGB, thumbnailUrl: feedPhotoStandIn('#1f2937', '#4b5563', 'portrait'), duration: 3000, order: 0, ...portrait }],
  likeCount: 41,
};

export const REEL_POSTS: readonly FeedPost[] = [REEL_STUDIO, REEL_SUNSET_EN, REEL_MARKET_IMAGES, REEL_VOICE, REEL_RANK2_ES, REEL_CITY_SILENT];

/** `pageOfReels` — la graine EXCLUE (`PostFeedService.getReels`), puis le même
 * keyset que le fil (`pageOfFeed`). */
export function pageOfReels(
  corpus: readonly FeedPost[],
  params: { readonly seed?: string; readonly cursor?: string; readonly limit: number },
): FeedPage {
  const { seed, cursor, limit } = params;
  return pageOfFeed(
    corpus.filter((post) => post.id !== seed),
    { ...(cursor !== undefined ? { cursor } : {}), limit },
  );
}
