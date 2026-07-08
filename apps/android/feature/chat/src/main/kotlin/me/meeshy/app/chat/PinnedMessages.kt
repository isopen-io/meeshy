package me.meeshy.app.chat

import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * The minimal projection of a loaded message the pinned-banner needs. Kept as a
 * narrow interface so the "which message anchors the banner / what does its
 * preview say" product decision stays pure and JVM-testable, free of Compose.
 */
interface PinnableMessage {
    val id: String
    /** ISO instant the message was pinned; null/blank ⇒ not pinned. */
    val pinnedAtIso: String?
    val isDeleted: Boolean
    val isOutgoing: Boolean
    /** Resolved sender label (display name or username); null ⇒ resolve from [isOutgoing]. */
    val senderName: String?
    /** Displayed textual body (already Prisme-resolved). */
    val text: String
    val hasImage: Boolean
    val hasFile: Boolean
}

/**
 * The preview shown in the pinned banner. Text carries the trimmed body verbatim;
 * the media/empty variants are copy-keys resolved to a localized string in the
 * screen (so the decision stays resource-free and testable — mirrors
 * `EmptyStateVisual`).
 */
sealed interface PinnedSnippet {
    data class Text(val value: String) : PinnedSnippet
    data object Image : PinnedSnippet
    data object File : PinnedSnippet
    data object Empty : PinnedSnippet
}

/**
 * The single pinned-banner surfaced above the message list.
 *
 * @property messageId the jump target — the *newest* pinned message.
 * @property count total number of currently-pinned messages in the conversation.
 * @property senderName sender of the featured message; null ⇒ resolve from [isOutgoing].
 * @property snippet the featured message's preview.
 */
data class PinnedBanner(
    val messageId: String,
    val count: Int,
    val senderName: String?,
    val isOutgoing: Boolean,
    val snippet: PinnedSnippet,
)

/**
 * Pure SSOT deriving the pinned-message banner from the loaded messages — parity
 * with iOS's pinned-messages strip. Rules:
 *  - A message counts as pinned only when it is **not deleted** and its
 *    [PinnableMessage.pinnedAtIso] is non-blank (a pinned message later deleted
 *    disappears from the strip, matching the bubble tombstone).
 *  - The banner features the **newest** pinned message (latest [pinnedAtIso],
 *    parsed to epoch millis); ties and unparseable instants keep the earliest in
 *    list order (stable), so the strip never flickers between equal-instant pins.
 *  - [PinnedBanner.count] is the total pinned count, so the strip can advertise
 *    "N épinglés" even though it shows one at a time.
 *  - The snippet is the featured message's trimmed text, else an Image/File key
 *    (image beats file, matching the scroll-affordance preview), else Empty.
 *  - No pinned message ⇒ null (no strip).
 */
object PinnedMessages {

    fun of(messages: List<PinnableMessage>): PinnedBanner? {
        val pinned = messages.filter { !it.isDeleted && !it.pinnedAtIso.isNullOrBlank() }
        if (pinned.isEmpty()) return null
        val featured = pinned.maxByStable { isoToEpochMillisOrNull(it.pinnedAtIso) ?: Long.MIN_VALUE }
        return PinnedBanner(
            messageId = featured.id,
            count = pinned.size,
            senderName = featured.senderName?.trim()?.ifBlank { null },
            isOutgoing = featured.isOutgoing,
            snippet = featured.snippet(),
        )
    }

    private fun PinnableMessage.snippet(): PinnedSnippet {
        val body = text.trim()
        return when {
            body.isNotEmpty() -> PinnedSnippet.Text(body)
            hasImage -> PinnedSnippet.Image
            hasFile -> PinnedSnippet.File
            else -> PinnedSnippet.Empty
        }
    }

    /**
     * Like `maxByOrNull` but on ties keeps the **first** element in iteration
     * order (`maxByOrNull` keeps the last), so an equal-instant tie resolves to
     * the earliest pinned message deterministically.
     */
    private inline fun <T> List<T>.maxByStable(selector: (T) -> Long): T {
        var best = this[0]
        var bestKey = selector(best)
        for (index in 1 until size) {
            val candidate = this[index]
            val key = selector(candidate)
            if (key > bestKey) {
                best = candidate
                bestKey = key
            }
        }
        return best
    }
}
