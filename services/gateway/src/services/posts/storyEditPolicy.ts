/**
 * Predicate deciding whether a PUT /posts/:postId payload is a CONTENT edit
 * of a story — new text, new composition blob or newly attached media — as
 * opposed to a metadata-only update (visibility, audience).
 *
 * A content edit UPDATES the existing story (#16386, directive porteur
 * 2026-11-05): views, reactions and impressions are kept; only the
 * translations of the stale text are dropped and re-run. The story:updated
 * broadcast says `engagementReset: false`, so clients keep it "seen".
 *
 * `removeMediaIds` alone is deliberately excluded: the composer always ships
 * a fresh `storyEffects` blob alongside any media removal, and the service
 * filters foreign ids the route cannot see.
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
