package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.composer.capture.SceneQuickCapture
import org.junit.Test

/** #13849 — la scène vide de la story arme le viseur ; ce qui est posé sur elle lui rend ses gestes. */
class StorySceneCaptureTest {

    private val blank = StorySlide(id = "s")

    @Test
    fun `a slide carrying only a background colour is blank, anything posed on it is not`() {
        assertThat(blank.isBlankScene).isTrue()
        assertThat(blank.copy(background = StoryBackgroundValue.parse("#112233"), text = "légende").isBlankScene).isTrue()
        listOf(
            blank.copy(mediaIds = listOf("m")),
            blank.copy(elements = listOf(StoryTextElement(id = "t", text = "Bonjour"))),
            blank.copy(stickers = listOf(StoryStickerElement(id = "k", emoji = "🔥"))),
            blank.copy(audio = listOf(StoryAudioPlayerObject(id = "a"))),
            blank.copy(placedMedia = listOf(StoryPlacedMedia("m"))),
        ).forEach { slide -> assertThat(slide.isBlankScene).isFalse() }
    }

    @Test
    fun `arming without a viewfinder does nothing, a hold films only where video is served`() {
        val none = StorySceneCapture(offer = null, onCaptured = {})
        none.arm(films = true)
        assertThat(none.armed).isFalse()

        val story = StorySceneCapture(offer = SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true), onCaptured = {})
        story.arm()
        assertThat(story.armed).isTrue()
        assertThat(story.filmsOnArm).isFalse()
        story.disarm()
        story.arm(films = true)
        assertThat(story.filmsOnArm).isTrue()

        val photos = StorySceneCapture(offer = SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = false), onCaptured = {})
        photos.arm(films = true)
        assertThat(photos.filmsOnArm).isFalse()
    }

    @Test
    fun `the scene offers its camera only at rest, on a blank slide, with nothing selected or open`() {
        val capture = StorySceneCapture(offer = SceneQuickCapture.Offer(allowsPhoto = true, allowsVideo = true), onCaptured = {})
        val rest = StoryComposerUiState()

        assertThat(capture.offeredOn(rest, somethingOpen = false)).isTrue()
        assertThat(capture.offeredOn(rest, somethingOpen = true)).isFalse()
        assertThat(capture.offeredOn(rest.copy(isDrawingActive = true), somethingOpen = false)).isFalse()
        val posed = rest.copy(deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("m"))), "s"))
        assertThat(capture.offeredOn(posed, somethingOpen = false)).isFalse()
        capture.arm()
        assertThat(capture.offeredOn(rest, somethingOpen = false)).isFalse()
    }
}
