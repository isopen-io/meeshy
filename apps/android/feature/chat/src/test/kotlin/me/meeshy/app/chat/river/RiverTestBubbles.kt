package me.meeshy.app.chat.river

import me.meeshy.ui.component.bubble.BubbleContent

/** L'usine de messages des témoins de la Rivière : un instant en minutes depuis un point fixe. */
internal fun riverBubble(
    id: String,
    sender: String,
    minutes: Int,
    name: String? = sender.replaceFirstChar { it.uppercase() },
    outgoing: Boolean = false,
    system: Boolean = false,
    deleted: Boolean = false,
    replyToId: String? = null,
    replyToText: String? = null,
    replyToSenderName: String? = null,
    text: String = "message $id",
    endToEnd: Boolean = false,
    viewOnce: Boolean = false,
    viewOnceOpened: Boolean = false,
): BubbleContent = BubbleContent(
    messageId = id,
    text = text,
    isOutgoing = outgoing,
    isTranslated = false,
    originalText = null,
    senderName = name,
    showSenderName = true,
    senderId = sender,
    isEdited = false,
    isDeleted = deleted,
    createdAtIso = "2026-10-27T%02d:%02d:00.000Z".format((600 + minutes) / 60, (600 + minutes) % 60),
    replyToId = replyToId,
    replyToText = replyToText,
    replyToSenderName = replyToSenderName,
    isSystem = system,
    isEndToEndSealed = endToEnd,
    isViewOnce = viewOnce,
    isViewOnceOpenedByMe = viewOnceOpened,
)
