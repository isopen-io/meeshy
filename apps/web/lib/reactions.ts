/**
 * Single source of truth for "is this post / reel / comment liked (hearted) by
 * the current user".
 *
 * The authoritative like-state lives on the entity itself: `currentUserReactions`
 * (maintained identically by the optimistic mutations and the Socket.IO cache
 * sync — the emoji is added on like, removed on unlike) plus the server-provided
 * `isLikedByMe` shortcut. Posts, reels and comments all carry these fields, so
 * they MUST derive "liked" the same way instead of each inlining the expression
 * (or, for comments, depending on an external `Set` that no caller populates).
 */

export const HEART_EMOJI = '❤️';

export function isHeartLikedByMe(entity: {
  currentUserReactions?: readonly string[] | null;
  isLikedByMe?: boolean;
}): boolean {
  return (entity.currentUserReactions ?? []).includes(HEART_EMOJI) || (entity.isLikedByMe ?? false);
}
