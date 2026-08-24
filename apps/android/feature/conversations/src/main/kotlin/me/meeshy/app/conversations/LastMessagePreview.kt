package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.isMeaningful

data class LastMessagePreviewLabels(
    val photo: String,
    val video: String,
    val voice: String,
    val file: String,
    val location: String,
    val none: String,
    val you: String,
    val senderFormat: String,
    val draftPrefix: String,
    // Kind-aware labels (parity with iOS `LastMessageSummaryKind` —
    // `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`).
    // Defaults let existing callers stay compile-compatible while a locale that
    // hasn't shipped the strings yet transparently falls back to the sender-prefixed
    // body (see `messageSummaryLine`) rather than a blank row.
    val expired: String = "",
    val hidden: String = "",
    val viewOnce: String = "",
)

/**
 * The draft-preview line for a conversation row, or `null` when [draft] is absent
 * or inert (so the caller falls back to [lastMessagePreview]). A meaningful draft's
 * own text wins over the last message — iOS shows an accent "Draft: …" preview for a
 * conversation the user has started replying to — prefixed by
 * [LastMessagePreviewLabels.draftPrefix]. A reply-only draft (armed reply, empty
 * text) shows the prefix with an ellipsis so the row still signals an unsent reply.
 */
fun draftPreview(
    draft: ConversationDraft?,
    labels: LastMessagePreviewLabels,
): String? {
    if (draft == null || !draft.isMeaningful) return null
    val text = draft.text.trim()
    return if (text.isEmpty()) labels.draftPrefix + "…" else labels.draftPrefix + text
}

/**
 * Rich last-message preview for a conversation row — port of the iOS
 * attachment-kind labels (📷 Photo / 🎬 Vidéo / 🎵 Message vocal / 📎 Fichier /
 * 📍 Localisation): a caption always wins over the type label, and group rows
 * prefix the sender ("Vous" for the current user).
 *
 * [resolvedContent] is the message's text AFTER the Prisme Linguistique
 * ([me.meeshy.sdk.model.resolvedLastMessagePreview]) — the reader's language when the
 * server shipped a translation for it, the original otherwise. It replaces
 * [ApiConversationLastMessage.content] and nothing else: the media-type labels below
 * are reached only when there is no text at all, so there is nothing to translate
 * there (same boundary the web twin draws in `formatLastMessage`). `null` — the default
 * — keeps the raw content, which is what every caller that has no reader prism at hand
 * (the widgets, the preview card, which resolves per message on its own) needs.
 */
fun lastMessagePreview(
    message: ApiConversationLastMessage?,
    currentUserId: String?,
    showSender: Boolean,
    labels: LastMessagePreviewLabels,
    resolvedContent: String? = null,
): String {
    if (message == null) return labels.none
    val body = (resolvedContent ?: message.content)?.trim().orEmpty().ifEmpty {
        when (message.messageType) {
            "image" -> labels.photo
            "video" -> labels.video
            "audio" -> labels.voice
            "file" -> labels.file
            "location" -> labels.location
            else -> ""
        }
    }
    if (body.isEmpty()) return labels.none
    if (!showSender) return body
    val sender = when {
        currentUserId != null && message.senderId == currentUserId -> labels.you
        else -> message.senderName?.takeIf { it.isNotBlank() }
    }
    return if (sender == null) body else labels.senderFormat.format(sender, body)
}

/**
 * Composes the row's summary line once typing/draft have been ruled out. The
 * returned [SummaryLine] carries both the display text and the classified
 * [MessageSummaryKind] so the Compose row can pick a kind-appropriate style
 * (icon, italic, colour) without re-classifying.
 *
 * Sender-prefix rules — parity with iOS `ThemedConversationRow.lastMessagePreviewView`:
 *   * [MessageSummaryKind.EXPIRED]: label alone, no sender prefix (the message is gone).
 *   * [MessageSummaryKind.HIDDEN] / [MessageSummaryKind.VIEW_ONCE]: sender-prefixed
 *     when [showSender] is true, so a group row still tells you *who* posted the
 *     hidden / view-once content.
 *   * [MessageSummaryKind.EPHEMERAL_ACTIVE] / [MessageSummaryKind.STANDARD]: reuse
 *     [lastMessagePreview] verbatim — same media-type body + sender-prefix rule.
 *
 * A blank kind-specific label (partial locale) transparently falls through to the
 * standard body path — a partial translation must not leave the row visually empty.
 */
fun messageSummaryLine(
    message: ApiConversationLastMessage?,
    currentUserId: String?,
    showSender: Boolean,
    labels: LastMessagePreviewLabels,
    nowMillis: Long,
    resolvedContent: String? = null,
): SummaryLine {
    val kind = MessageSummaryKind.of(message, nowMillis)
    return when (kind) {
        MessageSummaryKind.STANDARD, MessageSummaryKind.EPHEMERAL_ACTIVE -> SummaryLine(
            text = lastMessagePreview(message, currentUserId, showSender, labels, resolvedContent),
            kind = kind,
        )
        // EXPIRED / HIDDEN / VIEW_ONCE do not render the message text: their body is a
        // kind label, so there is nothing for the Prisme to resolve. The partial-locale
        // fall-through keeps its existing behaviour untouched — widening it is a
        // decision about what a hidden row may show, not part of this rule.
        MessageSummaryKind.EXPIRED -> SummaryLine(
            text = labels.expired.takeIf { it.isNotBlank() }
                ?: lastMessagePreview(message, currentUserId, showSender = false, labels),
            kind = kind,
        )
        MessageSummaryKind.HIDDEN -> SummaryLine(
            text = kindLabelWithSender(message, currentUserId, showSender, labels, labels.hidden),
            kind = kind,
        )
        MessageSummaryKind.VIEW_ONCE -> SummaryLine(
            text = kindLabelWithSender(message, currentUserId, showSender, labels, labels.viewOnce),
            kind = kind,
        )
    }
}

private fun kindLabelWithSender(
    message: ApiConversationLastMessage?,
    currentUserId: String?,
    showSender: Boolean,
    labels: LastMessagePreviewLabels,
    kindLabel: String,
): String {
    val body = kindLabel.takeIf { it.isNotBlank() }
        ?: return lastMessagePreview(message, currentUserId, showSender, labels)
    if (!showSender || message == null) return body
    val sender = when {
        currentUserId != null && message.senderId == currentUserId -> labels.you
        else -> message.senderName?.takeIf { it.isNotBlank() }
    }
    return if (sender == null) body else labels.senderFormat.format(sender, body)
}
