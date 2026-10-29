package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.UploadedMedia
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

@RunWith(JUnit4::class)
class StoryPlacedMediaPublicationTest {

    private fun image(id: String) = StoryMediaObject(id = id, postMediaId = id, mediaType = "image")
    private fun video(id: String) = StoryMediaObject(id = id, postMediaId = id, mediaType = "video")

    @Test
    fun `each placed media rides mediaObjects beside the background`() {
        val draft = StoryComposerDraft(
            mediaIds = listOf("bg", "m1"),
            backgroundMedia = StoryBackgroundMedia("bg", "https://x/bg.jpg", "image/jpeg", null),
            placedMedia = listOf(StoryPlacedMedia("m1", 0.2f, 0.3f, 1.5f, 10f).toMediaObject("https://x/m1.jpg", "image/jpeg", null)),
        )

        val objects = draft.toCreateStoryRequest("fr").storyEffects!!.mediaObjects!!

        assertThat(objects.map { it.id to it.isBackground }).containsExactly("bg" to true, "m1" to false).inOrder()
        assertThat(objects.last().x).isWithin(1e-6).of(0.2)
    }

    @Test
    fun `a story with only placed media still carries them`() {
        val draft = StoryComposerDraft(mediaIds = listOf("m1"), placedMedia = listOf(image("m1")))

        assertThat(draft.toCreateStoryRequest("fr").storyEffects!!.mediaObjects!!.map { it.id }).containsExactly("m1")
    }

    @Test
    fun `no placed media and no background keeps the effects untouched`() {
        assertThat(StoryComposerDraft(text = "a").toCreateStoryRequest("fr").storyEffects).isNull()
    }

    @Test
    fun `the scene never exceeds fifty images or fifty videos`() {
        val placed = (1..60).map { image("i$it") } + (1..60).map { video("v$it") }

        val kept = StoryPublishPlacedMedia.withinCaps(image("bg"), placed)

        assertThat(kept.count { it.mediaType == "image" }).isEqualTo(50)
        assertThat(kept.count { it.mediaType == "video" }).isEqualTo(50)
        assertThat(kept.first().id).isEqualTo("bg")
    }

    @Test
    fun `resolve skips the background, unknown and detached media`() {
        val slide = StorySlide(
            id = "s", mediaIds = listOf("bg", "m1"), backgroundMediaId = "bg",
            placedMedia = listOf(StoryPlacedMedia("bg"), StoryPlacedMedia("m1"), StoryPlacedMedia("gone")),
        )
        val state = StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            attachments = listOf(UploadedMedia(id = "m1", url = "https://x/m1.mp4", mimeType = "video/mp4", fileSize = 1L, width = null, height = null, durationMs = 4000L, thumbnailUrl = null)),
        )

        val objects = StoryPublishPlacedMedia.resolve(slide, state)

        assertThat(objects.map { it.id }).containsExactly("m1")
        assertThat(objects.single().mediaType).isEqualTo("video")
        assertThat(objects.single().duration).isEqualTo(4.0)
    }
}
