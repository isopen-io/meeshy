package me.meeshy.app.stories

import androidx.compose.runtime.Immutable

/**
 * Pure, immutable reaction state for one story slide, backing the viewer's
 * quick-reaction strip.
 *
 * Unlike iOS (`sendReaction` is fire-and-forget and waits for the socket echo
 * to provide its own `+1`), Android updates **optimistically**: [reactedLocally]
 * bumps the count instantly. To avoid double-counting when the gateway echoes
 * the same reaction back, [applyDelta] is idempotent for the user's OWN add of
 * an emoji that is already in [mine] (the optimistic state already counted it).
 *
 * - [count] — total reactions on the slide (never negative).
 * - [mine]  — the distinct emojis the current user has reacted with (parity with
 *   iOS `currentUserReactions`).
 */
@Immutable
data class StoryReactionState(
    val count: Int = 0,
    val mine: Set<String> = emptySet(),
) {
    val hasReacted: Boolean get() = mine.isNotEmpty()

    /** Optimistic local tap on the quick-strip: additive and idempotent per emoji. */
    fun reactedLocally(emoji: String): StoryReactionState =
        if (emoji in mine) this
        else StoryReactionState(count = count + 1, mine = mine + emoji)

    /**
     * Reconcile a realtime `story:reacted`/`story:unreacted` delta.
     * @param isOwn whether the acting user is the current user.
     */
    fun applyDelta(emoji: String, delta: Int, isOwn: Boolean): StoryReactionState = when {
        delta > 0 && isOwn && emoji in mine -> this
        delta > 0 && isOwn -> StoryReactionState(count = count + 1, mine = mine + emoji)
        delta > 0 -> copy(count = count + 1)
        delta < 0 -> StoryReactionState(
            count = (count - 1).coerceAtLeast(0),
            mine = if (isOwn) mine - emoji else mine,
        )
        else -> this
    }
}
