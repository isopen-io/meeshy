package me.meeshy.app.reels

import me.meeshy.sdk.util.resolveMediaUrl
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
    val isBookmarked: Boolean,
    val bookmarkCount: Int,
)

object ReelBuilder {

    /**
     * Maps reel posts to presentations, keeping only those typed `REEL` (mirrors iOS
     * `FeedPost.isReel` / `FeedPost.reels(from:)` — the product rule only ever classifies
     * a video ≥ 3s as a reel; an ordinary POST carrying a video stays a POST) with a
     * playable video media. Mirrors the Feed's URL resolution ([mediaBaseUrl] = the
     * gateway host).
     */
    fun build(posts: List<ApiPost>, mediaBaseUrl: String?): List<ReelPresentation> =
        posts.asSequence()
            .filter { it.type?.uppercase() == "REEL" }
            .mapNotNull { post ->
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
                    isBookmarked = post.isBookmarkedByMe == true,
                    bookmarkCount = post.bookmarkCount ?: 0,
                )
            }
            .toList()

    /**
     * Moves the reel matching [seedId] to the front of [reels], preserving the
     * relative order of the rest — the cold-start cache seed (§ ReelsViewModel.load)
     * mirrors the gateway's own affinity thread, which always starts at the seed. A
     * blank/absent [seedId] or a seed not present in [reels] leaves the list untouched.
     */
    fun withSeedFirst(reels: List<ReelPresentation>, seedId: String?): List<ReelPresentation> {
        if (seedId.isNullOrBlank()) return reels
        val seedIndex = reels.indexOfFirst { it.id == seedId }
        if (seedIndex <= 0) return reels
        val seedReel = reels[seedIndex]
        return listOf(seedReel) + reels.filterIndexed { index, _ -> index != seedIndex }
    }

    private val ApiPostMedia.isVideo: Boolean
        get() = mimeType?.startsWith("video/") == true

}
