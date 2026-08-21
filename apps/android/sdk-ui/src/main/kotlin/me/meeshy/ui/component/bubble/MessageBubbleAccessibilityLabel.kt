package me.meeshy.ui.component.bubble

import java.util.Locale

/**
 * Localized wording for the composed message-bubble accessibility label, injected by the
 * Compose layer from string resources so [MessageBubbleAccessibilityLabel] stays free of any
 * Android dependency and fully JVM-testable — the same injection pattern as
 * [me.meeshy.ui.format.RelativeTimeFormat].
 *
 * Count/name templates carry a single positional placeholder (`%d` for counts, `%s` for a name
 * or summary). [replyToExcerpt] carries two positional placeholders (`%1$s` author, `%2$s`
 * excerpt) since order must survive localization.
 */
public data class BubbleAccessibilityStrings(
    val unknownSender: String,
    val deleted: String,
    val replyToAuthor: String,
    val replyToExcerpt: String,
    val images: String,
    val audios: String,
    val location: String,
    val file: String,
    val edited: String,
    val pinned: String,
    val ephemeral: String,
    val reactions: String,
    val delivery: BubbleDeliveryA11yStrings,
)

/** The six spoken delivery phrasings, one per [DeliveryStatus] arm. */
public data class BubbleDeliveryA11yStrings(
    val sending: String,
    val queued: String,
    val sent: String,
    val delivered: String,
    val read: String,
    val failed: String,
)

/**
 * Composes a single spoken accessibility label for a message bubble — a faithful port of iOS
 * `MessageAccessibilityLabelComposer.compose`, adapted to the flat Android [BubbleContent] model.
 *
 * The reading order is frozen to match iOS: sender → reply → text → images → audios →
 * location/files → time → delivery → edited → pinned → ephemeral → reactions. Parts are joined
 * with `", "`. A deleted message short-circuits to the sender plus the "deleted" phrasing (the
 * bubble hides its body, attachments and reactions behind a tombstone — so does the label).
 *
 * Assumed deviations from the iOS source, documented rather than corrected silently:
 * - Android's [BubbleContent] carries no image/video distinction, so a single "images" count
 *   covers every visual attachment (iOS splits image vs video counts).
 * - Android's reply target carries no "is me" flag, so the reply author is the quoted sender
 *   name (or the unknown-sender placeholder) — there is no dedicated "you" phrasing.
 * - Android's bubble shows no clock in its meta row, so [timeText] is supplied by the caller
 *   only where a time is actually presented; a blank/absent value drops the time arm.
 */
public object MessageBubbleAccessibilityLabel {

    public fun compose(
        content: BubbleContent,
        strings: BubbleAccessibilityStrings,
        locale: Locale,
        timeText: String? = null,
    ): String {
        val parts = mutableListOf<String>()

        if (!content.isOutgoing) {
            parts += content.senderName?.takeIf { it.isNotBlank() } ?: strings.unknownSender
        }

        replyLabel(content, strings)?.let { parts += it }

        if (content.isDeleted) {
            parts += strings.deleted
            return parts.joinToString(", ")
        }

        if (content.text.isNotBlank()) {
            parts += content.text
        }

        if (content.images.isNotEmpty()) {
            parts += String.format(locale, strings.images, content.images.size)
        }
        if (content.audios.isNotEmpty()) {
            parts += String.format(locale, strings.audios, content.audios.size)
        }
        content.locations.forEach { _ -> parts += strings.location }
        content.files.forEach { file ->
            parts += String.format(locale, strings.file, file.name?.trim().orEmpty())
        }

        timeText?.takeIf { it.isNotBlank() }?.let { parts += it }

        if (content.isOutgoing) {
            parts += deliveryLabel(content.deliveryStatus, strings.delivery)
        }
        if (content.isEdited) parts += strings.edited
        if (content.pinnedAtIso != null) parts += strings.pinned
        if (content.expiresAtIso != null) parts += strings.ephemeral

        if (content.reactions.isNotEmpty()) {
            val summary = content.reactions.joinToString(", ") { "${it.emoji} ${it.count}" }
            parts += String.format(locale, strings.reactions, summary)
        }

        return parts.joinToString(", ")
    }

    private fun replyLabel(content: BubbleContent, strings: BubbleAccessibilityStrings): String? {
        if (content.replyToText == null && !content.replyToDeleted) return null
        val author = content.replyToSenderName?.takeIf { it.isNotBlank() } ?: strings.unknownSender
        val excerpt = content.replyToText?.trim()?.takeIf { it.isNotEmpty() }
        return if (excerpt != null) {
            String.format(strings.replyToExcerpt, author, excerpt)
        } else {
            String.format(strings.replyToAuthor, author)
        }
    }

    private fun deliveryLabel(
        status: DeliveryStatus,
        strings: BubbleDeliveryA11yStrings,
    ): String = when (status) {
        DeliveryStatus.Pending -> strings.sending
        DeliveryStatus.QueuedOffline -> strings.queued
        DeliveryStatus.Sent -> strings.sent
        DeliveryStatus.Delivered -> strings.delivered
        DeliveryStatus.Read -> strings.read
        DeliveryStatus.Failed -> strings.failed
    }
}
