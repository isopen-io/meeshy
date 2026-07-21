/**
 * Snapshot figé d'un post cité dans une réponse privée.
 *
 * Quand un utilisateur répond à un POST — STATUS (mood, éphémère 1h), STORY
 * (éphémère 21h), REEL ou POST permanent — depuis l'app, le message créé doit
 * GELER les détails du post au moment de la réponse. Sinon, à l'expiration ou
 * la suppression du post, la résolution live (`storyReplyToId` → lookup Post)
 * renvoie null et la citation perd son contenu, son emoji de mood, sa date,
 * ses compteurs et sa vignette.
 *
 * Le snapshot est persisté dans `Message.metadata.postReplyTo` (le champ
 * `metadata Json?` existe déjà — pas de colonne dédiée) et voyage tel quel vers
 * le client (la réponse expose `metadata` en `additionalProperties: true`).
 * `buildPostReplyTo` produit DIRECTEMENT la forme servie au client (`id`, pas
 * `postId`) pour que le stockage et le payload soient identiques.
 *
 * Helpers PURS et testables.
 */

import { sliceCodePoints } from '@meeshy/shared/utils/text-truncate';

export type PostReplySnapshotablePost = {
  id: string;
  type: string;
  content: string | null;
  moodEmoji: string | null;
  reactionCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  createdAt: Date;
  media: ReadonlyArray<{ thumbnailUrl: string | null }>;
};

/** Forme servie au client (et stockée telle quelle dans `metadata.postReplyTo`). */
export type PostReplyTo = {
  id: string;
  /** "STATUS" | "STORY" | "POST" | "REEL" — pilote le rendu (mood vs story). */
  type: string;
  /** Non-null ⇒ mood/statut : rendu dédié emoji + contenu + date côté client. */
  moodEmoji: string | null;
  previewText: string;
  thumbnailUrl: string | null;
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  /** ISO 8601 — date de publication du post citée, figée. */
  createdAt: string;
};

const PREVIEW_MAX = 80;

/** Gèle les champs d'un Post en un `postReplyTo` sérialisable (Json Prisma). */
export function buildPostReplyTo(post: PostReplySnapshotablePost): PostReplyTo {
  return {
    id: post.id,
    type: post.type,
    moodEmoji: post.moodEmoji ?? null,
    previewText: sliceCodePoints((post.content ?? '').trim(), PREVIEW_MAX),
    thumbnailUrl: post.media[0]?.thumbnailUrl ?? null,
    reactionCount: post.reactionCount ?? 0,
    commentCount: post.commentCount ?? 0,
    shareCount: post.shareCount ?? 0,
    createdAt: post.createdAt.toISOString(),
  };
}

/** Sélecteur Prisma minimal pour `buildPostReplyTo`. */
export const POST_REPLY_SNAPSHOT_SELECT = Object.freeze({
  id: true,
  type: true,
  content: true,
  moodEmoji: true,
  reactionCount: true,
  commentCount: true,
  shareCount: true,
  createdAt: true,
  media: { select: { thumbnailUrl: true }, orderBy: { order: 'asc' as const }, take: 1 },
});

/**
 * Normalise un `metadata.postReplyTo` persisté (Json Prisma, forme inconnue au
 * type) vers `PostReplyTo`. Retourne `null` si absent ou malformé (le caller
 * retombe alors sur la résolution live de `storyReplyToId`).
 */
export function normalizePostReplyTo(raw: unknown): PostReplyTo | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const id = typeof s.id === 'string' ? s.id : null;
  if (!id) return null;
  return {
    id,
    type: typeof s.type === 'string' ? s.type : 'POST',
    moodEmoji: typeof s.moodEmoji === 'string' ? s.moodEmoji : null,
    previewText: typeof s.previewText === 'string' ? s.previewText : '',
    thumbnailUrl: typeof s.thumbnailUrl === 'string' ? s.thumbnailUrl : null,
    reactionCount: typeof s.reactionCount === 'number' ? s.reactionCount : 0,
    commentCount: typeof s.commentCount === 'number' ? s.commentCount : 0,
    shareCount: typeof s.shareCount === 'number' ? s.shareCount : 0,
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date(0).toISOString(),
  };
}

/** Lit `metadata.postReplyTo` depuis un blob `metadata` arbitraire. */
export function postReplyToFromMetadata(metadata: unknown): PostReplyTo | null {
  if (!metadata || typeof metadata !== 'object') return null;
  return normalizePostReplyTo((metadata as Record<string, unknown>).postReplyTo);
}
