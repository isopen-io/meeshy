package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.MediaTrimBounds
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Couper la vidéo de FOND (#13973, lot A-E2, iOS `StoryMediaObject.sourceStart/sourceEnd` de l'objet `isBackground`) : la
 * fenêtre gardée s'écrit sur la diapo à chaque image du geste, la publication la porte sur l'objet de fond, le brouillon la
 * garde, une story rouverte la retrouve ; un nouveau fond, ou le fond retiré, l'oublie. Une image, ou une vidéo dont la
 * durée n'est pas connue, ne se coupe pas.
 */
@RunWith(JUnit4::class)
class StoryBackgroundTrimTest {

    private fun media(id: String, mime: String, durationMs: Long?) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = durationMs, thumbnailUrl = null)

    private fun state(mime: String = "video/mp4", durationMs: Long? = 8_000, designated: Boolean = true, trim: MediaTrimBounds? = null): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = listOf("bg", "other"), backgroundMediaId = "bg".takeIf { designated }, backgroundTrim = trim)
        return StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            attachments = listOf(media("bg", mime, durationMs), media("other", "video/mp4", 4_000)),
        )
    }

    private fun StoryComposerUiState.slide() = deck.selectedSlide

    @Test
    fun `the kept window of the background video is written, and designates the background it cuts`() {
        val next = StoryComposerBackgroundReducer.trimmed(state(designated = false), MediaTrimBounds(2.0, 5.0))

        assertThat(next.slide().backgroundTrim).isEqualTo(MediaTrimBounds(2.0, 5.0))
        assertThat(next.slide().backgroundMediaId).isEqualTo("bg")
        assertThat(next.backgroundTrimOf("bg")).isEqualTo(MediaTrimBounds(2.0, 5.0))
    }

    @Test
    fun `the whole source kept is no cut at all`() {
        val next = StoryComposerBackgroundReducer.trimmed(state(trim = MediaTrimBounds(2.0, 5.0)), MediaTrimBounds(0.0, 8.0))

        assertThat(next.slide().backgroundTrim).isNull()
        assertThat(next.backgroundTrimOf("bg")).isEqualTo(MediaTrimBounds(0.0, 8.0))
    }

    @Test
    fun `an image, or a video of unknown length, is not cut`() {
        val image = state(mime = "image/jpeg", durationMs = null)
        val unknown = state(durationMs = null)

        assertThat(image.backgroundTrimSourceOf("bg")).isNull()
        assertThat(unknown.backgroundTrimSourceOf("bg")).isNull()
        assertThat(StoryComposerBackgroundReducer.trimmed(image, MediaTrimBounds(1.0, 2.0))).isSameInstanceAs(image)
        assertThat(StoryComposerBackgroundReducer.trimmed(unknown, MediaTrimBounds(1.0, 2.0))).isSameInstanceAs(unknown)
    }

    @Test
    fun `the publication carries the kept window on the background object`() {
        val s = state(trim = MediaTrimBounds(2.0, 5.0))

        val background = StoryPublishBackground.resolve(s.slide(), s)!!.toMediaObject()

        assertThat(background.sourceStart).isEqualTo(2.0)
        assertThat(background.sourceEnd).isEqualTo(5.0)
        assertThat(StoryPublishBackground.resolve(state().slide(), state())!!.toMediaObject().sourceStart).isNull()
    }

    @Test
    fun `a new background, or the background removed, forgets the cut`() {
        val cut = state(trim = MediaTrimBounds(2.0, 5.0))

        assertThat(cut.deck.toggleSelectedBackgroundMedia("other").selectedSlide.backgroundTrim).isNull()
        assertThat(cut.deck.removeMedia("bg").selectedSlide.backgroundTrim).isNull()
        assertThat(cut.deck.removeMedia("other").selectedSlide.backgroundTrim).isEqualTo(MediaTrimBounds(2.0, 5.0))
    }

    @Test
    fun `the cut survives the round trip of the draft, an old draft reads uncut`() {
        val json = Json { ignoreUnknownKeys = true }
        val snapshot = state(trim = MediaTrimBounds(2.0, 5.0)).deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z")

        val back = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), json.encodeToString(StoryComposerDraftSnapshot.serializer(), snapshot)).toDeck()!!

        assertThat(back.slides.single().backgroundTrim).isEqualTo(MediaTrimBounds(2.0, 5.0))
        val old = state().deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-10-31T00:00:00Z").toDeck()!!
        assertThat(old.slides.single().backgroundTrim).isNull()
    }

    @Test
    fun `a story cut on iOS reopens its cut, and cutting a reopened story sends the new window`() {
        val ios = StoryEditFixtures.iosPost
        val effects = ios.storyEffects!!
        val cut = ios.copy(storyEffects = effects.copy(mediaObjects = effects.mediaObjects!!.map { if (it.isBackground) it.copy(sourceStart = 1.0, sourceEnd = 3.0) else it }))

        val opening = StoryEditFixtures.opening(cut)
        assertThat(opening.slide.backgroundTrim).isEqualTo(MediaTrimBounds(1.0, 3.0))

        val opened = StoryEditFixtures.opened(opening)
        val slide = opened.deck.selectedSlide.copy(backgroundTrim = MediaTrimBounds(0.5, 2.5))
        val edited = opened.copy(deck = StorySlideDeck(listOf(slide), slide.id)).mirrorDraftToSelection()
        val background = (StoryEditMerge.plan(opening, edited, "fr") as StoryEditPlan.Ready).optimistic.storyEffects!!.mediaObjects!!.first { it.isBackground }

        assertThat(background.sourceStart).isEqualTo(0.5)
        assertThat(background.sourceEnd).isEqualTo(2.5)
    }
}
