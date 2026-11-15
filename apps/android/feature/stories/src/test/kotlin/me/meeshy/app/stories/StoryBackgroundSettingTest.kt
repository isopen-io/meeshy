package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryMediaRotation
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Le Son et Pivoter du fond média (#14083, comme l'objet `isBackground` d'iOS) : Pivoter tourne le fond d'un quart, le Son
 * règle le volume d'une vidéo de fond de 0 à 100 % et Muet la coupe en rendant le niveau quitté ; la publication porte
 * `rotation` et `volume` sur l'objet de fond, le brouillon les garde, une story rouverte les retrouve ; un nouveau fond, ou
 * le fond retiré, les oublie. Une image n'a pas de son.
 */
@RunWith(JUnit4::class)
class StoryBackgroundSettingTest {

    private fun media(id: String, mime: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = 8_000, thumbnailUrl = null)

    private fun state(mime: String = "video/mp4", setting: StoryBackgroundSetting = StoryBackgroundSetting()): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = listOf("bg", "other"), backgroundMediaId = "bg", backgroundSetting = setting)
        return StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            attachments = listOf(media("bg", mime), media("other", "video/mp4")),
        )
    }

    private fun StoryComposerUiState.setting() = deck.selectedSlide.backgroundSetting

    @Test
    fun `Rotate turns the background a quarter at each touch, and comes back to upright after four`() {
        val once = StoryComposerBackgroundReducer.rotated(state())
        val four = (1..4).fold(state()) { s, _ -> StoryComposerBackgroundReducer.rotated(s) }

        assertThat(once.setting().rotationDeg).isEqualTo(StoryMediaRotation.turned(0f))
        assertThat(four.setting().rotationDeg).isEqualTo(0f)
    }

    @Test
    fun `the volume of a background video runs from 0 to 100 percent, and Mute gives back the level it left`() {
        val set = StoryComposerBackgroundReducer.volumeSet(state(), 0.4f)
        val loud = StoryComposerBackgroundReducer.volumeSet(state(), 1.7f)
        val muted = StoryComposerBackgroundReducer.muteToggled(set)
        val back = StoryComposerBackgroundReducer.muteToggled(muted)

        assertThat(set.setting().volume).isWithin(1e-4f).of(0.4f)
        assertThat(loud.setting().volume).isEqualTo(1f)
        assertThat(muted.setting().volume).isEqualTo(0f)
        assertThat(back.setting().volume).isWithin(1e-4f).of(0.4f)
    }

    @Test
    fun `a background image has no sound to set`() {
        val image = state(mime = "image/jpeg")

        assertThat(StoryComposerBackgroundReducer.volumeSet(image, 0.4f)).isSameInstanceAs(image)
        assertThat(StoryComposerBackgroundReducer.muteToggled(image)).isSameInstanceAs(image)
    }

    @Test
    fun `the publication carries the rotation and the volume on the background object, an untouched background carries neither`() {
        val s = state(setting = StoryBackgroundSetting(rotationDeg = 270f, volume = 0.4f))

        val background = StoryPublishBackground.resolve(s.deck.selectedSlide, s)!!.toMediaObject()
        val plain = StoryPublishBackground.resolve(state().deck.selectedSlide, state())!!.toMediaObject()

        assertThat(background.rotation).isEqualTo(270.0)
        assertThat(background.volume).isWithin(1e-4f).of(0.4f)
        assertThat(plain.rotation).isEqualTo(0.0)
        assertThat(plain.volume).isEqualTo(1f)
    }

    @Test
    fun `a new background, or the background removed, forgets its rotation and its sound`() {
        val set = state(setting = StoryBackgroundSetting(rotationDeg = 90f, volume = 0.2f))

        assertThat(set.deck.toggleSelectedBackgroundMedia("other").selectedSlide.backgroundSetting).isEqualTo(StoryBackgroundSetting())
        assertThat(set.deck.removeMedia("bg").selectedSlide.backgroundSetting).isEqualTo(StoryBackgroundSetting())
        assertThat(set.deck.removeMedia("other").selectedSlide.backgroundSetting.rotationDeg).isEqualTo(90f)
    }

    @Test
    fun `the rotation and the sound survive the round trip of the draft, an old draft reads upright and at full volume`() {
        val json = Json { ignoreUnknownKeys = true }
        val muted = StoryBackgroundSetting(rotationDeg = 180f, volume = 0f, mutedVolumeMemento = 0.6f)
        val snapshot = state(setting = muted).deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-11-01T00:00:00Z")

        val back = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), json.encodeToString(StoryComposerDraftSnapshot.serializer(), snapshot)).toDeck()!!

        assertThat(back.slides.single().backgroundSetting).isEqualTo(muted)
        val old = state().deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-11-01T00:00:00Z").toDeck()!!
        assertThat(old.slides.single().backgroundSetting).isEqualTo(StoryBackgroundSetting())
    }

    @Test
    fun `a story turned on iOS reopens turned, and turning a reopened story sends the new rotation and volume`() {
        val ios = StoryEditFixtures.iosPost
        val effects = ios.storyEffects!!
        val turned = ios.copy(storyEffects = effects.copy(mediaObjects = effects.mediaObjects!!.map { if (it.isBackground) it.copy(rotation = 90.0, volume = 0.5f) else it }))

        val opening = StoryEditFixtures.opening(turned)
        assertThat(opening.slide.backgroundSetting.rotationDeg).isEqualTo(90f)
        assertThat(opening.slide.backgroundSetting.volume).isWithin(1e-4f).of(0.5f)

        val opened = StoryEditFixtures.opened(opening)
        val slide = opened.deck.selectedSlide.copy(backgroundSetting = StoryBackgroundSetting(rotationDeg = 180f, volume = 0.3f))
        val edited = opened.copy(deck = StorySlideDeck(listOf(slide), slide.id)).mirrorDraftToSelection()
        val background = (StoryEditMerge.plan(opening, edited, "fr") as StoryEditPlan.Ready).optimistic.storyEffects!!.mediaObjects!!.first { it.isBackground }

        assertThat(background.rotation).isEqualTo(180.0)
        assertThat(background.volume).isWithin(1e-4f).of(0.3f)
    }
}
