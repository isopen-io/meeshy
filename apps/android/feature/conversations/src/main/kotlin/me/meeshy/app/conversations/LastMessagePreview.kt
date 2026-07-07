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
 */
fun lastMessagePreview(
    message: ApiConversationLastMessage?,
    currentUserId: String?,
    showSender: Boolean,
    labels: LastMessagePreviewLabels,
): String {
    if (message == null) return labels.none
    val body = message.content?.trim().orEmpty().ifEmpty {
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
