/**
 * Predicate deciding whether a PUT /posts/:postId payload is a CONTENT edit
 * of a story — new text, new composition blob or newly attached media — as
 * opposed to a metadata-only update (visibility, audience).
 *
 * A content edit restarts the story's life: PostService wipes views,
 * reactions and impressions, and the route flags the story:updated
 * broadcast with `engagementReset: true` so clients mark the story unseen
 * again. Both sides MUST share this single predicate so they can never
 * disagree on the same payload.
 *
 * `removeMediaIds` alone is deliberately excluded: the composer always ships
 * a fresh `storyEffects` blob alongside any media removal, and the service
 * filters foreign ids the route cannot see — keying the reset on
 * removeMediaIds would let the two sides diverge.
 */
export function storyContentEditRequested(data: {
  content?: string;
  storyEffects?: Record<string, unknown>;
  mediaIds?: string[];
  visibility?: string;
  visibilityUserIds?: string[];
  removeMediaIds?: string[];
  moodEmoji?: string;
  originalLanguage?: string;
  type?: string;
}): boolean {
  return data.content !== undefined
    || data.storyEffects !== undefined
    || (data.mediaIds?.length ?? 0) > 0;
}
