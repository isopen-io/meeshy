package me.meeshy.app.feed

import androidx.compose.runtime.Immutable

/**
 * One page of a feed post's fullscreen media gallery: the full-resolution image
 * [url] plus the post's [caption] (its text, trimmed, `null` when blank), the
 * author [authorName] and the [createdAtIso] sent-timestamp to surface in the
 * viewer chrome. Every image of a multi-image post shares that one caption /
 * author / timestamp, mirroring the chat gallery ([GalleryPage]) whose pages all
 * key back to the owning message.
 */
@Immutable
data class FeedGalleryPage(
    val url: String,
    val caption: String? = null,
    val authorName: String? = null,
    val createdAtIso: String? = null,
)

/**
 * The fullscreen media gallery resolved for a single feed post: every image of the
 * post flattened in order as [pages], plus the [startIndex] of the tapped image.
 *
 * Port of iOS's feed post lightbox: tapping any tile of a post's media collage
 * opens a pager across *that post's* images, positioned on the tapped one.
 */
@Immutable
data class FeedGallery(
    val pages: List<FeedGalleryPage>,
    val startIndex: Int,
) {
    /** The full-resolution image URLs, one per page, in post order. */
    val imageUrls: List<String> get() = pages.map { it.url }

    /**
     * The per-page captions, positionally aligned with [imageUrls]; a page with no
     * caption holds `null` (the viewer shows no overlay for it).
     */
    val captions: List<String?> get() = pages.map { it.caption }

    /**
     * The per-page author names, positionally aligned with [imageUrls]; `null` when
     * the post has no resolvable author.
     */
    val authorNames: List<String?> get() = pages.map { it.authorName }

    /**
     * The per-page sent-timestamps (ISO-8601), positionally aligned with
     * [imageUrls]; `null` when the post carries no timestamp.
     */
    val createdAtIsos: List<String?> get() = pages.map { it.createdAtIso }

    /** True when the post carries no showable image — nothing to open. */
    val isEmpty: Boolean get() = pages.isEmpty()
}

/**
 * Pure SSOT that flattens a feed post's images into the fullscreen gallery and
 * resolves where a tap lands.
 *
 * The pages carry the post's *full-resolution* URLs (never the collage thumbnail)
 * so the lightbox is crisp, and each shares the post's text as its caption
 * (trimmed, `null` when blank) plus the post author / timestamp for the viewer
 * chrome — exactly as iOS keys every attachment of a post to the post body. The
 * [startIndex] is the tapped image clamped into the post's own bounds, so an
 * out-of-range or negative index never escapes the gallery. A post with no image
 * yields an empty gallery (`isEmpty` — nothing to open).
 */
object FeedMediaGallery {

    private val EMPTY = FeedGallery(emptyList(), 0)

    fun of(post: FeedPostPresentation, imageIndex: Int): FeedGallery {
        val images = post.images
        if (images.isEmpty()) return EMPTY
        val caption = post.content.trim().ifBlank { null }
        val authorName = post.authorName?.trim()?.ifBlank { null }
        val createdAtIso = post.createdAtIso?.trim()?.ifBlank { null }
        val pages = images.map { image ->
            FeedGalleryPage(
                url = image.url,
                caption = caption,
                authorName = authorName,
                createdAtIso = createdAtIso,
            )
        }
        return FeedGallery(pages, imageIndex.coerceIn(0, pages.lastIndex))
    }
}
