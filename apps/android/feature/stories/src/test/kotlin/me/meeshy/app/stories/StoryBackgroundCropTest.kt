package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import me.meeshy.sdk.model.scene.StoryBackgroundObjectTransform
import me.meeshy.sdk.model.scene.StoryCanvasTransform
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Recadrer le fond image (#13973, iOS `ComposerMediaCropPads` sur l'objet `isBackground`) : les proportions choisies
 * gardent le plus grand cadre centré dans la source, « Original » la rend entière, une vidéo ne se recadre pas ; la scène
 * peint le cadre comme le lecteur le peindra, la publication porte `crop` sur l'objet de fond, le brouillon le garde, une
 * story rouverte le retrouve et un nouveau fond l'oublie.
 */
@RunWith(JUnit4::class)
class StoryBackgroundCropTest {

    private fun media(id: String, mime: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 1000, height = 1000, durationMs = 8_000, thumbnailUrl = null)

    private fun state(mime: String = "image/jpeg", setting: StoryBackgroundSetting = StoryBackgroundSetting()): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = listOf("bg", "other"), backgroundMediaId = "bg", backgroundSetting = setting)
        return StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            attachments = listOf(media("bg", mime), media("other", "image/jpeg")),
        )
    }

    private val landscape = StoryMediaCrop(x = 0.0, y = 0.21875, width = 1.0, height = 0.5625)

    private fun StoryComposerUiState.crop() = deck.selectedSlide.backgroundSetting.crop

    @Test
    fun `Crop frames a background image at the chosen proportions, and Original gives the whole source back`() {
        val cropped = StoryComposerBackgroundReducer.cropPreset(state(), ComposerCropPreset.LANDSCAPE)
        val original = StoryComposerBackgroundReducer.cropPreset(cropped, ComposerCropPreset.ORIGINAL)

        assertThat(cropped.crop()).isEqualTo(landscape)
        assertThat(cropped.backgroundCropPreset).isEqualTo(ComposerCropPreset.LANDSCAPE)
        assertThat(original.crop()).isNull()
        assertThat(original.backgroundCropPreset).isEqualTo(ComposerCropPreset.ORIGINAL)
    }

    @Test
    fun `a background video is not cropped`() {
        val video = state(mime = "video/mp4")

        assertThat(StoryComposerBackgroundReducer.cropPreset(video, ComposerCropPreset.SQUARE)).isSameInstanceAs(video)
    }

    @Test
    fun `cropping a background the scene paints without designation designates it`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("bg"))
        val undesignated = StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = listOf(media("bg", "image/jpeg")))

        val cropped = StoryComposerBackgroundReducer.cropPreset(undesignated, ComposerCropPreset.LANDSCAPE)

        assertThat(cropped.deck.selectedSlide.backgroundMediaId).isEqualTo("bg")
        assertThat(cropped.crop()).isEqualTo(landscape)
    }

    @Test
    fun `the scene paints the crop exactly as the reader will, never stretched, the author's pan and zoom on top`() {
        val crop = StoryMediaCrop(x = 0.0, y = 0.0, width = 1.0, height = 0.5)
        val pan = StoryCanvasTransform(scale = 1.5f, offsetX = 12f, offsetY = -8f)
        val reader = StoryBackgroundObjectTransform.from(StoryMediaObject(id = "bg", crop = crop), sourceAspect = 0.75, filled = true)

        val layer = pan.backgroundLayer(crop, sourceAspect = 0.75, filled = true, canvasWidthPx = 100f, canvasHeightPx = 200f)

        assertThat(layer.scaleX).isWithin(1e-4f).of(1.5f * reader.scaleX)
        assertThat(layer.scaleY).isWithin(1e-4f).of(1.5f * reader.scaleY)
        assertThat(layer.translationX).isWithin(1e-3f).of(12f + reader.offsetXFraction * 100f)
        assertThat(layer.translationY).isWithin(1e-3f).of(-8f + reader.offsetYFraction * 200f)
        assertThat(layer.scaleX).isEqualTo(layer.scaleY)
        assertThat(pan.backgroundLayer(null, 0.75, true, 100f, 200f)).isEqualTo(BackgroundLayer(1.5f, 1.5f, 12f, -8f))
    }

    @Test
    fun `the publication carries the crop on the background image, an uncropped background carries none`() {
        val cropped = state(setting = StoryBackgroundSetting(crop = landscape))

        val background = StoryPublishBackground.resolve(cropped.deck.selectedSlide, cropped)!!.toMediaObject()
        val plain = StoryPublishBackground.resolve(state().deck.selectedSlide, state())!!.toMediaObject()

        assertThat(background.crop).isEqualTo(landscape)
        assertThat(plain.crop).isNull()
    }

    @Test
    fun `a new background, or the background removed, forgets its crop`() {
        val cropped = state(setting = StoryBackgroundSetting(crop = landscape))

        assertThat(cropped.deck.toggleSelectedBackgroundMedia("other").selectedSlide.backgroundSetting.crop).isNull()
        assertThat(cropped.deck.removeMedia("bg").selectedSlide.backgroundSetting.crop).isNull()
        assertThat(cropped.deck.removeMedia("other").selectedSlide.backgroundSetting.crop).isEqualTo(landscape)
    }

    @Test
    fun `the crop survives the round trip of the draft, an old draft reads uncropped`() {
        val json = Json { ignoreUnknownKeys = true }
        val snapshot = state(setting = StoryBackgroundSetting(crop = landscape)).deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-11-02T00:00:00Z")

        val back = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), json.encodeToString(StoryComposerDraftSnapshot.serializer(), snapshot)).toDeck()!!

        assertThat(back.slides.single().backgroundSetting.crop).isEqualTo(landscape)
        val old = state().deck.toDraftSnapshot(StoryVisibility.PUBLIC, null, "2026-11-02T00:00:00Z").toDeck()!!
        assertThat(old.slides.single().backgroundSetting.crop).isNull()
    }

    @Test
    fun `a story cropped on iOS reopens cropped, and cropping a reopened story sends the new crop`() {
        val ios = StoryEditFixtures.iosPost
        val effects = ios.storyEffects!!
        val cropped = ios.copy(storyEffects = effects.copy(mediaObjects = effects.mediaObjects!!.map { if (it.isBackground) it.copy(crop = landscape) else it }))

        val opening = StoryEditFixtures.opening(cropped)
        assertThat(opening.slide.backgroundSetting.crop).isEqualTo(landscape)

        val square = StoryMediaCrop(x = 0.25, y = 0.0, width = 0.5, height = 1.0)
        val opened = StoryEditFixtures.opened(opening)
        val slide = opened.deck.selectedSlide.copy(backgroundSetting = opened.deck.selectedSlide.backgroundSetting.copy(crop = square))
        val edited = opened.copy(deck = StorySlideDeck(listOf(slide), slide.id)).mirrorDraftToSelection()
        val background = (StoryEditMerge.plan(opening, edited, "fr") as StoryEditPlan.Ready).optimistic.storyEffects!!.mediaObjects!!.first { it.isBackground }

        assertThat(background.crop).isEqualTo(square)
    }
}
