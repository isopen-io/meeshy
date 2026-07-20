package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleContent

/**
 * One page of the fullscreen media gallery: the image [url] plus the optional
 * [caption] to overlay while it is on screen (the owning message's text) and the
 * optional author [senderName] / [createdAtIso] sent-timestamp of that message.
 * Port of iOS `ConversationMediaGalleryView`, whose bottom chrome surfaces each
 * media's author (name + `sentAt`) above the message-content caption. A media-only
 * message with no text has a null caption (no overlay); an author-less / undated
 * media (own outgoing image, missing timestamp) holds null for those too.
 */
public data class GalleryPage(
    val url: String,
    val caption: String? = null,
    val senderName: String? = null,
    val createdAtIso: String? = null,
)

/**
 * The fullscreen media gallery resolved for a conversation: every image across
 * every (non-deleted) message, flattened in conversation order as [pages], plus
 * the [startIndex] of the image the viewer tapped.
 *
 * Port of iOS `ConversationMediaGalleryView`, which pages across ALL of a
 * conversation's visual media — not just the tapped message's — so a single
 * swipe carries the viewer through the whole conversation. Android previously
 * scoped the viewer to one message; this widens it to the conversation.
 */
public data class ConversationGallery(
    val pages: List<GalleryPage>,
    val startIndex: Int,
) {
    /** The flat image URLs, one per page, in conversation order. */
    val imageUrls: List<String> get() = pages.map { it.url }

    /**
     * The per-page captions, positionally aligned with [imageUrls]; a page with
     * no caption holds `null` (the viewer shows no overlay for it).
     */
    val captions: List<String?> get() = pages.map { it.caption }

    /**
     * The per-page author names, positionally aligned with [imageUrls]; a page
     * whose owning message has no resolvable sender holds `null` (no author line).
     */
    val senderNames: List<String?> get() = pages.map { it.senderName }

    /**
     * The per-page sent-timestamps (ISO-8601), positionally aligned with
     * [imageUrls]; a page whose owning message has no timestamp holds `null`.
     */
    val createdAtIsos: List<String?> get() = pages.map { it.createdAtIso }

    /** True when the conversation carries no showable image — nothing to open. */
    val isEmpty: Boolean get() = pages.isEmpty()
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
 *
 * Each page carries its owning message's text as the caption (trimmed, null when
 * blank) — every image of a multi-image message shares that one caption, exactly
 * as iOS's `captionMap` keys every attachment of a message to the message body.
 */
public object ConversationMediaGallery {

    private val EMPTY = ConversationGallery(emptyList(), 0)

    public fun of(
        messages: List<BubbleContent>,
        messageId: String,
        imageIndex: Int,
    ): ConversationGallery {
        val pages = mutableListOf<GalleryPage>()
        var startIndex = 0
        var matched = false
        for (message in messages) {
            if (message.isDeleted) continue
            val images = message.images
            if (!matched && message.messageId == messageId && images.isNotEmpty()) {
                startIndex = pages.size + imageIndex.coerceIn(0, images.lastIndex)
                matched = true
            }
            val caption = message.text.trim().ifBlank { null }
            val senderName = message.senderName?.trim()?.ifBlank { null }
            val createdAtIso = message.createdAtIso?.trim()?.ifBlank { null }
            images.forEach {
                pages.add(
                    GalleryPage(
                        url = it.url,
                        caption = caption,
                        senderName = senderName,
                        createdAtIso = createdAtIso,
                    ),
                )
            }
        }
        if (pages.isEmpty()) return EMPTY
        return ConversationGallery(pages, startIndex.coerceIn(0, pages.lastIndex))
    }
}
