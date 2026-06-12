package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversationLastMessage

data class LastMessagePreviewLabels(
    val photo: String,
    val video: String,
    val voice: String,
    val file: String,
    val location: String,
    val none: String,
    val you: String,
)

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
    return if (sender == null) body else "$sender : $body"
}
