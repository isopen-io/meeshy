package me.meeshy.app.navigation

import android.net.Uri

/**
 * Optional `messageId` argument of the chat route: the message to scroll to and highlight when
 * a conversation is opened from a notification, a link, a widget or a shortcut. Absent = the
 * historical behaviour, so every old link keeps resolving.
 */
object ChatRouteArgs {
    const val HIGHLIGHT_MESSAGE_ID: String = "messageId"

    fun route(conversationId: String, highlightMessageId: String?): String {
        val base = "chat/$conversationId"
        return if (highlightMessageId.isNullOrBlank()) base
        else "$base?$HIGHLIGHT_MESSAGE_ID=${Uri.encode(highlightMessageId)}"
    }
}
