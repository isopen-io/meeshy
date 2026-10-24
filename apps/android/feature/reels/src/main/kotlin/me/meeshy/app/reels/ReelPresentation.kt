package me.meeshy.app.reels

import me.meeshy.sdk.util.resolveMediaUrl
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.displayContent
import me.meeshy.sdk.model.isTranslated
import me.meeshy.sdk.model.ReelMediaLayout
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.lang.LanguageResolver

/** A single reel ready to render: a playable video + its author/caption/counters. */
data class ReelPresentation(
    val id: String,
    /** The URL the player streams: the video, else the audio track; null for an images-only reel. */
    val videoUrl: String?,
    val posterUrl: String?,
    /** Which surface renders the reel's media (video / images / audio / images + audio). */
    val layout: ReelMediaLayout = ReelMediaLayout.Empty,
    /** Resolved image URLs, in order — the slides of an image reel or the backdrop of an audio one. */
    val imageUrls: List<String> = emptyList(),
    val audioUrl: String? = null,
    val username: String? = null,
    val authorId: String?,
    val authorName: String?,
    val authorAvatarUrl: String?,
    /** The caption in the reader's language (Prisme), or the original when none is preferred. */
    val caption: String?,
    val isCaptionTranslated: Boolean = false,
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
    fun build(
        posts: List<ApiPost>,
        mediaBaseUrl: String?,
        preferences: LanguageResolver.ContentLanguagePreferences? = null,
    ): List<ReelPresentation> =
        posts.asSequence()
            .filter { it.type?.uppercase() == "REEL" }
            .mapNotNull { post ->
                val feedMedia = post.media.orEmpty()
                    .sortedBy { it.order ?: Int.MAX_VALUE }
                    .mapNotNull { it.toReelMedia() }
                val layout = ReelMediaLayout.resolve(feedMedia)
                if (layout is ReelMediaLayout.Empty) return@mapNotNull null
                val resolve = { url: String -> resolveMediaUrl(url, mediaBaseUrl) }
                val images = feedMedia.filter { it.type == FeedMediaType.IMAGE }.mapNotNull { it.url?.let(resolve) }
                val audio = feedMedia.firstOrNull { it.type == FeedMediaType.AUDIO }?.url?.let(resolve)
                val video = (layout as? ReelMediaLayout.Video)?.media
                ReelPresentation(
                    id = post.id,
                    videoUrl = video?.url?.let(resolve) ?: audio,
                    posterUrl = (video?.thumbnailUrl ?: feedMedia.firstOrNull()?.thumbnailUrl)?.let(resolve),
                    layout = layout,
                    imageUrls = images,
                    audioUrl = audio,
                    username = post.author?.username?.takeIf { it.isNotBlank() },
                    authorId = post.author?.id,
                    authorName = (post.author?.displayName ?: post.author?.username)
                        ?.takeIf { it.isNotBlank() },
                    authorAvatarUrl = resolveServedImageUrl(post.author?.avatar, mediaBaseUrl),
                    caption = (preferences?.let(post::displayContent) ?: post.content)?.takeIf { it.isNotBlank() },
                    isCaptionTranslated = preferences?.let(post::isTranslated) == true,
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

    private fun ApiPostMedia.toReelMedia(): FeedMedia? {
        val url = fileUrl ?: return null
        val mime = mimeType.orEmpty()
        val type = when {
            mime.startsWith("video/") -> FeedMediaType.VIDEO
            mime.startsWith("audio/") -> FeedMediaType.AUDIO
            mime.startsWith("image/") -> FeedMediaType.IMAGE
            else -> return null
        }
        return FeedMedia(id = id, type = type, url = url, thumbnailUrl = thumbnailUrl, duration = duration)
    }

}
