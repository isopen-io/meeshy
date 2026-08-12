/**
 * Pure helpers for optimistic mutation of a post/comment `reactionSummary`
 * (`Record<emoji, count>`).
 *
 * Single source of truth for the "delete the key when the count reaches zero"
 * invariant. The authoritative Socket.IO reconciliation
 * (`use-post-socket-cache-sync`) already removes an emoji from the summary once
 * its aggregated count hits zero; optimistic mutations MUST mirror that so a
 * removed reaction never leaves a residual `{ [emoji]: 0 }` entry — which the
 * feed/detail renderers would surface as a stray "0" chip
 * (`Object.entries(reactionSummary)` iterates every key regardless of value).
 */

type ReactionSummary = Record<string, number>;

export function decrementReactionSummary(
  summary: ReactionSummary | null | undefined,
  emoji: string,
): ReactionSummary {
  const next: ReactionSummary = { ...(summary ?? {}) };
  const count = (next[emoji] ?? 0) - 1;
  if (count > 0) {
    next[emoji] = count;
  } else {
    delete next[emoji];
  }
  return next;
}
