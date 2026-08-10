package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [ReelComposition] — the creation-time reel-qualification
 * predicate (règle produit 2026-08-02 + directive durée minimale). Mirrors iOS SDK
 * `ReelCompositionTests` (packages/MeeshySDK/Tests/MeeshySDKTests/Models/
 * FeedReelClassificationTests.swift) and the gateway's authoritative
 * `qualifiesAsReel` (services/gateway/src/services/posts/reelComposition.ts) —
 * every case here has a same-shaped sibling on both other sites.
 */
class ReelCompositionTest {

    /** Duration comfortably above the floor — used by cases unrelated to timing. */
    private val long = 5000L

    private fun media(vararg mimeTypes: String): List<ReelComposition.MediaKind> =
        mimeTypes.map { ReelComposition.MediaKind(mimeType = it, durationMs = long) }

    // --- qualifiesAsReel — video (>=3s) || audio (>=3s) || >= 2 images ------

    @Test
    fun `a video, an audio, or at least two images qualifies as a reel`() {
        assertThat(ReelComposition.qualifiesAsReel(media("video/mp4"))).isTrue()
        assertThat(ReelComposition.qualifiesAsReel(media("audio/mp4"))).isTrue()
        assertThat(ReelComposition.qualifiesAsReel(media("image/jpeg", "image/jpeg"))).isTrue()
        assertThat(ReelComposition.qualifiesAsReel(media("image/jpeg", "image/jpeg", "image/jpeg"))).isTrue()
        assertThat(ReelComposition.qualifiesAsReel(media("audio/mp4", "image/jpeg"))).isTrue()
        assertThat(ReelComposition.qualifiesAsReel(media("video/mp4", "image/jpeg"))).isTrue()
    }

    @Test
    fun `a single image does NOT qualify — the 2 to 1 removal trap`() {
        assertThat(ReelComposition.qualifiesAsReel(media("image/jpeg"))).isFalse()
        assertThat(ReelComposition.qualifiesAsReel(media("image/jpeg", "application/pdf"))).isFalse()
    }

    @Test
    fun `no media or only non-reel media never qualifies`() {
        assertThat(ReelComposition.qualifiesAsReel(emptyList())).isFalse()
        assertThat(ReelComposition.qualifiesAsReel(media("application/pdf"))).isFalse()
        assertThat(ReelComposition.qualifiesAsReel(media("application/pdf", "application/pdf"))).isFalse()
    }

    @Test
    fun `a video or audio under 3 seconds does NOT qualify`() {
        assertThat(
            ReelComposition.qualifiesAsReel(listOf(ReelComposition.MediaKind("video/mp4", 2999))),
        ).isFalse()
        assertThat(
            ReelComposition.qualifiesAsReel(listOf(ReelComposition.MediaKind("audio/mp4", 2999))),
        ).isFalse()
        assertThat(
            ReelComposition.qualifiesAsReel(listOf(ReelComposition.MediaKind("video/mp4", 0))),
        ).isFalse()
    }

    @Test
    fun `a video or audio at exactly 3 seconds qualifies`() {
        assertThat(
            ReelComposition.qualifiesAsReel(listOf(ReelComposition.MediaKind("video/mp4", 3000))),
        ).isTrue()
        assertThat(
            ReelComposition.qualifiesAsReel(listOf(ReelComposition.MediaKind("audio/mp4", 3000))),
        ).isTrue()
    }

    @Test
    fun `a missing duration on video or audio does NOT qualify`() {
        assertThat(
            ReelComposition.qualifiesAsReel(listOf(ReelComposition.MediaKind("video/mp4", null))),
        ).isFalse()
        assertThat(
            ReelComposition.qualifiesAsReel(listOf(ReelComposition.MediaKind("audio/mp4", null))),
        ).isFalse()
    }

    @Test
    fun `images are never subject to the duration floor`() {
        assertThat(
            ReelComposition.qualifiesAsReel(
                listOf(ReelComposition.MediaKind("image/jpeg", 0), ReelComposition.MediaKind("image/png", null)),
            ),
        ).isTrue()
    }

    @Test
    fun `mime matching is case-insensitive`() {
        assertThat(ReelComposition.qualifiesAsReel(media("IMAGE/JPEG", "Image/PNG"))).isTrue()
    }

    // --- defaultType ---------------------------------------------------------

    @Test
    fun `qualifying compositions default to REEL`() {
        assertThat(ReelComposition.defaultType(media("video/mp4"))).isEqualTo(PostType.REEL)
        assertThat(ReelComposition.defaultType(media("audio/mp4"))).isEqualTo(PostType.REEL)
        assertThat(ReelComposition.defaultType(media("image/jpeg", "image/jpeg"))).isEqualTo(PostType.REEL)
    }

    @Test
    fun `a single image defaults to POST even without forcePlainPost`() {
        assertThat(ReelComposition.defaultType(media("image/jpeg"))).isEqualTo(PostType.POST)
    }

    @Test
    fun `a video under 3 seconds defaults to POST`() {
        assertThat(
            ReelComposition.defaultType(listOf(ReelComposition.MediaKind("video/mp4", 1000))),
        ).isEqualTo(PostType.POST)
    }

    @Test
    fun `forcing a plain post overrides the reel default`() {
        assertThat(ReelComposition.defaultType(media("video/mp4"), forcePlainPost = true)).isEqualTo(PostType.POST)
        assertThat(ReelComposition.defaultType(media("audio/mp4"), forcePlainPost = true)).isEqualTo(PostType.POST)
    }

    @Test
    fun `text-only or document-only compositions default to POST`() {
        assertThat(ReelComposition.defaultType(emptyList())).isEqualTo(PostType.POST)
        assertThat(ReelComposition.defaultType(media("application/pdf"))).isEqualTo(PostType.POST)
    }
}
