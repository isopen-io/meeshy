package me.meeshy.app.reels

import me.meeshy.sdk.model.ReelMediaLayout

/** What fills a reel page under its overlay — port of iOS `ReelFeedCard.background`. */
sealed interface ReelBackdrop {
    /** A still: the first image of the reel, or the cover of an audio reel. */
    data class Picture(val url: String) : ReelBackdrop

    /** An audio reel with no cover: a tinted canvas with a waveform, never a black screen. */
    data object AudioCanvas : ReelBackdrop

    /** A video reel: its own surface fills the page. */
    data object None : ReelBackdrop
}

/**
 * How one reel page is staged: the still behind it, the media the player streams, and
 * whether the player's picture is shown at all. Only a video has a picture — an audio
 * track rendered through a video surface is a black rectangle over its own backdrop.
 */
data class ReelStage(
    val backdrop: ReelBackdrop,
    val playableUrl: String?,
    val showsVideoSurface: Boolean,
)

val ReelPresentation.stage: ReelStage
    get() {
        val isVideo = layout is ReelMediaLayout.Video
        val still = imageUrls.firstOrNull() ?: posterUrl
        val backdrop = when {
            isVideo -> ReelBackdrop.None
            still != null -> ReelBackdrop.Picture(still)
            layout is ReelMediaLayout.AudioOnly -> ReelBackdrop.AudioCanvas
            else -> ReelBackdrop.None
        }
        return ReelStage(backdrop = backdrop, playableUrl = videoUrl, showsVideoSurface = isVideo)
    }
