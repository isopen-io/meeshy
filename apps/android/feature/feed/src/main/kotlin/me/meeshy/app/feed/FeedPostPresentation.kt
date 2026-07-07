package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isTranslated

/** An image attachment ready for display in a feed card. */
@Immutable
data class FeedPostImage(
    val id: String,
    val url: String,
    val thumbnailUrl: String?,
    val width: Int?,
    val height: Int?,
)

/**
 * A feed post projected for rendering: Prisme-resolved content, the viewer's own
 * like state (never inferred from the public count) and resolved media URLs.
 *
 * Pure data — built by [FeedPostBuilder] so the resolution is unit-testable and
 * the Compose layer stays dumb.
 */
@Immutable
data class FeedPostPresentation(
    val id: String,
    val authorName: String?,
    val authorAvatarUrl: String?,
    val createdAtIso: String?,
    val content: String,
    val isTranslated: Boolean,
    val moodEmoji: String?,
    val images: List<FeedPostImage>,
    val likeCount: Int,
    val isLiked: Boolean,
    val commentCount: Int,
    val repostCount: Int,
    val isPinned: Boolean,
    val isEdited: Boolean,
    val isReel: Boolean,
)

object FeedPostBuilder {

    fun build(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        mediaBaseUrl: String?,
    ): FeedPostPresentation {
        val images = post.media
            .orEmpty()
            .filter { it.isImage && it.fileUrl != null }
            .sortedBy { it.order ?: Int.MAX_VALUE }
            .map { media ->
                FeedPostImage(
                    id = media.id,
                    url = resolveMediaUrl(media.fileUrl!!, mediaBaseUrl),
                    thumbnailUrl = media.thumbnailUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                    width = media.width,
                    height = media.height,
                )
            }
        return FeedPostPresentation(
            id = post.id,
            authorName = (post.author?.displayName ?: post.author?.username)
                ?.takeIf { it.isNotBlank() },
            authorAvatarUrl = post.author?.avatar
                ?.let { resolveMediaUrl(it, mediaBaseUrl) },
            createdAtIso = post.createdAt,
            content = post.displayContent(preferences),
            isTranslated = post.isTranslated(preferences),
            moodEmoji = post.moodEmoji?.takeIf { it.isNotBlank() },
            images = images,
            likeCount = post.likeCount ?: 0,
            isLiked = post.isLikedByMe == true,
            commentCount = post.commentCount ?: 0,
            repostCount = post.repostCount ?: 0,
            isPinned = post.isPinned == true,
            isEdited = post.isEdited == true,
            isReel = post.type.equals("reel", ignoreCase = true),
        )
    }

    private val ApiPostMedia.isImage: Boolean
        get() = mimeType?.startsWith("image/") == true

    private fun resolveMediaUrl(url: String, mediaBaseUrl: String?): String = when {
        url.startsWith("http") -> url
        mediaBaseUrl == null -> url
        else -> mediaBaseUrl.trimEnd('/') + (if (url.startsWith("/")) url else "/$url")
    }
}
