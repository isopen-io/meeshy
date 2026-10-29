package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryPlacedMediaTest {

    @Test
    fun `a slide without placed media is the default and an old blob decodes to none`() {
        assertThat(StorySlide(id = "s").placedMedia).isEmpty()
        val old = StoryDraftSlideSnapshot(id = "s")
        assertThat(old.placedMedia).isEmpty()
    }

    @Test
    fun `a foreground media object from an iOS story becomes a placed media and the background is skipped`() {
        val ios = listOf(
            StoryMediaObject(id = "bg", postMediaId = "bg", isBackground = true),
            StoryMediaObject(id = "o1", postMediaId = "m1", x = 0.2, y = 0.8, scale = 1.5, rotation = 30.0),
        )

        val placed = StoryPlacedMedia.foreground(ios)

        assertThat(placed).containsExactly(StoryPlacedMedia(mediaId = "m1", x = 0.2f, y = 0.8f, scale = 1.5f, rotationDeg = 30f))
    }

    @Test
    fun `a hostile placement is pulled back into the canvas`() {
        val tame = StoryPlacedMedia(mediaId = "m", x = 9f, y = Float.NaN, scale = 99f, rotationDeg = 540f).normalised()

        assertThat(tame.x).isEqualTo(1f)
        assertThat(tame.y).isEqualTo(0.5f)
        assertThat(tame.scale).isAtMost(4f)
        assertThat(tame.rotationDeg).isAtLeast(-180f)
        assertThat(tame.rotationDeg).isAtMost(180f)
    }

    @Test
    fun `the wire object carries the placement beside the media identity and is never a background`() {
        val obj = StoryPlacedMedia(mediaId = "m1", x = 0.3f, y = 0.6f, scale = 2f, rotationDeg = -20f)
            .toMediaObject(url = "https://x/m1.jpg", mimeType = "image/jpeg", durationSeconds = null)

        assertThat(obj.postMediaId).isEqualTo("m1")
        assertThat(obj.mediaURL).isEqualTo("https://x/m1.jpg")
        assertThat(obj.mediaType).isEqualTo("image")
        assertThat(obj.isBackground).isFalse()
        assertThat(obj.x).isWithin(1e-6).of(0.3)
        assertThat(obj.rotation).isWithin(1e-6).of(-20.0)
    }

    @Test
    fun `placed media survives the durable draft round trip`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "s", mediaIds = listOf("m1"), placedMedia = listOf(StoryPlacedMedia("m1", 0.1f, 0.9f, 1.2f, 15f)))),
            selectedId = "s",
        )

        val back = deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-29T00:00:00Z").toDeck()!!

        assertThat(back.slides.single().placedMedia).containsExactly(StoryPlacedMedia("m1", 0.1f, 0.9f, 1.2f, 15f))
    }

    @Test
    fun `removing a media drops its placement`() {
        val deck = StorySlideDeck(
            slides = listOf(StorySlide(id = "s", mediaIds = listOf("m1", "m2"), placedMedia = listOf(StoryPlacedMedia("m1"), StoryPlacedMedia("m2")))),
            selectedId = "s",
        )

        assertThat(deck.removeMedia("m1").slides.single().placedMedia.map { it.mediaId }).containsExactly("m2")
    }
}
