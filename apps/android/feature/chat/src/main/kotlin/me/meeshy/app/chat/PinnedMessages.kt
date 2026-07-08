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
 * One row of the pinned-messages sheet — a single currently-pinned message. Uses
 * the same projection the banner features ([PinnedBanner]), so the sheet and the
 * banner never disagree about which messages are pinned or how their preview reads.
 */
data class PinnedMessageRow(
    val messageId: String,
    val senderName: String?,
    val isOutgoing: Boolean,
    val snippet: PinnedSnippet,
)

/**
 * Pure SSOT for the full pinned-messages list (the sheet reached from the banner) —
 * parity with iOS's pinned-messages list. Rules:
 *  - A message counts as pinned only when it is **not deleted** and its
 *    [PinnableMessage.pinnedAtIso] is non-blank (a pinned message later deleted
 *    drops out of the list, matching the bubble tombstone).
 *  - Rows are ordered **newest pin first** (latest [pinnedAtIso], parsed to epoch
 *    millis); ties and unparseable instants keep their incoming list order (the
 *    sort is stable), so the list never flickers between equal-instant pins and an
 *    unparseable pin sinks to the end rather than jumping to the top.
 *  - Each row's snippet is the message's trimmed text, else an Image/File key
 *    (image beats file, matching the scroll-affordance preview), else Empty; a
 *    blank sender name resolves to null.
 *  - Nothing pinned ⇒ an empty list.
 */
object PinnedMessagesList {

    fun of(messages: List<PinnableMessage>): List<PinnedMessageRow> =
        messages
            .filter { !it.isDeleted && !it.pinnedAtIso.isNullOrBlank() }
            .sortedByDescending { isoToEpochMillisOrNull(it.pinnedAtIso) ?: Long.MIN_VALUE }
            .map { it.toRow() }
}

/**
 * Pure SSOT deriving the pinned-message banner from the loaded messages — the strip
 * shown above the list. It features the **newest** pinned message (the first row of
 * [PinnedMessagesList], which is already newest-first) and advertises the total
 * pinned [PinnedBanner.count] even though it shows one at a time. No pin ⇒ null.
 */
object PinnedMessages {

    fun of(messages: List<PinnableMessage>): PinnedBanner? {
        val rows = PinnedMessagesList.of(messages)
        val featured = rows.firstOrNull() ?: return null
        return PinnedBanner(
            messageId = featured.messageId,
            count = rows.size,
            senderName = featured.senderName,
            isOutgoing = featured.isOutgoing,
            snippet = featured.snippet,
        )
    }
}

private fun PinnableMessage.toRow(): PinnedMessageRow = PinnedMessageRow(
    messageId = id,
    senderName = senderName?.trim()?.ifBlank { null },
    isOutgoing = isOutgoing,
    snippet = snippet(),
)

private fun PinnableMessage.snippet(): PinnedSnippet {
    val body = text.trim()
    return when {
        body.isNotEmpty() -> PinnedSnippet.Text(body)
        hasImage -> PinnedSnippet.Image
        hasFile -> PinnedSnippet.File
        else -> PinnedSnippet.Empty
    }
}
