package me.meeshy.app.reels

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia

/** A single reel ready to render: a playable video + its author/caption/counters. */
data class ReelPresentation(
    val id: String,
    val videoUrl: String,
    val posterUrl: String?,
    val authorName: String?,
    val authorAvatarUrl: String?,
    val caption: String?,
    val likeCount: Int,
    val isLiked: Boolean,
    val commentCount: Int,
    val repostCount: Int,
)

object ReelBuilder {

    /**
     * Maps reel posts to presentations, keeping only those with a playable video
     * media. Mirrors the Feed's URL resolution ([mediaBaseUrl] = the gateway host).
     */
    fun build(posts: List<ApiPost>, mediaBaseUrl: String?): List<ReelPresentation> =
        posts.mapNotNull { post ->
            val video = post.media.orEmpty()
                .sortedBy { it.order ?: Int.MAX_VALUE }
                .firstOrNull { it.isVideo && it.fileUrl != null }
                ?: return@mapNotNull null
            ReelPresentation(
                id = post.id,
                videoUrl = resolveMediaUrl(video.fileUrl!!, mediaBaseUrl),
                posterUrl = video.thumbnailUrl?.let { resolveMediaUrl(it, mediaBaseUrl) },
                authorName = (post.author?.displayName ?: post.author?.username)
                    ?.takeIf { it.isNotBlank() },
                authorAvatarUrl = post.author?.avatar?.let { resolveMediaUrl(it, mediaBaseUrl) },
                caption = post.content?.takeIf { it.isNotBlank() },
                likeCount = post.likeCount ?: 0,
                isLiked = post.isLikedByMe == true,
                commentCount = post.commentCount ?: 0,
                repostCount = post.repostCount ?: 0,
            )
        }

    private val ApiPostMedia.isVideo: Boolean
        get() = mimeType?.startsWith("video/") == true

    private fun resolveMediaUrl(url: String, mediaBaseUrl: String?): String = when {
        url.startsWith("http") -> url
        mediaBaseUrl == null -> url
        else -> mediaBaseUrl.trimEnd('/') + (if (url.startsWith("/")) url else "/$url")
    }
}
