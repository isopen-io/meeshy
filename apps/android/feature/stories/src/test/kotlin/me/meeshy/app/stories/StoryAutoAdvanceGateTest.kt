package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryAutoAdvanceGateTest {

    private fun slide(id: String = "s1", imageUrl: String? = null) =
        StorySlideView(id = id, text = "t", isTranslated = false, imageUrl = imageUrl, accentHex = "1A1A2E")

    @Test
    fun `no slide never counts down`() {
        assertThat(StoryAutoAdvanceGate.shouldCountdown(slide = null, resolvedImageUrls = emptySet())).isFalse()
    }

    @Test
    fun `a text-only slide counts down immediately`() {
        assertThat(StoryAutoAdvanceGate.shouldCountdown(slide(imageUrl = null), resolvedImageUrls = emptySet()))
            .isTrue()
    }

    @Test
    fun `an image slide waits until its image has resolved`() {
        val s = slide(imageUrl = "https://cdn/x.jpg")

        assertThat(StoryAutoAdvanceGate.shouldCountdown(s, resolvedImageUrls = emptySet())).isFalse()
        assertThat(StoryAutoAdvanceGate.shouldCountdown(s, resolvedImageUrls = setOf("https://cdn/x.jpg"))).isTrue()
    }

    @Test
    fun `a different resolved url does not unblock this image slide`() {
        val s = slide(imageUrl = "https://cdn/x.jpg")

        assertThat(StoryAutoAdvanceGate.shouldCountdown(s, resolvedImageUrls = setOf("https://cdn/other.jpg")))
            .isFalse()
    }

    @Test
    fun `a video that is still buffering holds the countdown, text and image slides alike`() {
        val buffering = StoryMediaReadiness(videoBuffering = true)

        assertThat(StoryAutoAdvanceGate.shouldCountdown(slide(), emptySet(), buffering)).isFalse()
        val image = slide(imageUrl = "https://cdn/x.jpg")
        assertThat(StoryAutoAdvanceGate.shouldCountdown(image, setOf("https://cdn/x.jpg"), buffering)).isFalse()
    }

    @Test
    fun `an audio track that is not ready holds the countdown until it is`() {
        val pending = StoryMediaReadiness(audioPending = true)

        assertThat(StoryAutoAdvanceGate.shouldCountdown(slide(), emptySet(), pending)).isFalse()
        assertThat(StoryAutoAdvanceGate.shouldCountdown(slide(), emptySet(), StoryMediaReadiness.Ready)).isTrue()
    }

    @Test
    fun `ready media never holds a slide whose image has resolved`() {
        val image = slide(imageUrl = "https://cdn/x.jpg")

        assertThat(StoryAutoAdvanceGate.shouldCountdown(image, setOf("https://cdn/x.jpg"), StoryMediaReadiness.Ready)).isTrue()
    }

    @Test
    fun `a foreground clip not ready holds the start of the countdown`() {
        val pending = StoryMediaReadiness(foregroundPending = true)

        assertThat(StoryAutoAdvanceGate.shouldCountdown(slide(), emptySet(), pending)).isFalse()
        assertThat(StoryAutoAdvanceGate.shouldCountdown(slide(), emptySet(), StoryMediaReadiness.Ready)).isTrue()
    }

    @Test
    fun `a foreground clip not ready never counts as a playback stall`() {
        assertThat(StoryMediaReadiness(foregroundPending = true).waiting).isFalse()
    }
}
