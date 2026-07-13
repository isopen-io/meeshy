package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleContent

/**
 * The fullscreen media gallery resolved for a conversation: every image across
 * every (non-deleted) message, flattened in conversation order, plus the
 * [startIndex] of the image the viewer tapped.
 *
 * Port of iOS `ConversationMediaGalleryView`, which pages across ALL of a
 * conversation's visual media — not just the tapped message's — so a single
 * swipe carries the viewer through the whole conversation. Android previously
 * scoped the viewer to one message; this widens it to the conversation.
 */
public data class ConversationGallery(
    val imageUrls: List<String>,
    val startIndex: Int,
) {
    /** True when the conversation carries no showable image — nothing to open. */
    val isEmpty: Boolean get() = imageUrls.isEmpty()
}

/**
 * Pure SSOT that flattens a conversation's bubbles into the fullscreen image
 * gallery and resolves where a tap lands.
 *
 * The flatten walks the bubbles in conversation order, concatenating each
 * non-deleted message's images (a deleted bubble contributes none — its media
 * must never resurface in the gallery). The [startIndex] is the flat position of
 * the tapped image: the running image count before the tapped message plus the
 * tapped [imageIndex] within it (clamped into the message's own bounds, so an
 * out-of-range or negative index never escapes the message). When the tapped
 * message is unknown, deleted, or carries no image, the gallery still opens on
 * the whole conversation from its first image rather than collapsing to nothing.
 */
public object ConversationMediaGallery {

    private val EMPTY = ConversationGallery(emptyList(), 0)

    public fun of(
        messages: List<BubbleContent>,
        messageId: String,
        imageIndex: Int,
    ): ConversationGallery {
        val urls = mutableListOf<String>()
        var startIndex = 0
        var matched = false
        for (message in messages) {
            if (message.isDeleted) continue
            val images = message.images
            if (!matched && message.messageId == messageId && images.isNotEmpty()) {
                startIndex = urls.size + imageIndex.coerceIn(0, images.lastIndex)
                matched = true
            }
            images.forEach { urls.add(it.url) }
        }
        if (urls.isEmpty()) return EMPTY
        return ConversationGallery(urls, startIndex.coerceIn(0, urls.lastIndex))
    }
}
