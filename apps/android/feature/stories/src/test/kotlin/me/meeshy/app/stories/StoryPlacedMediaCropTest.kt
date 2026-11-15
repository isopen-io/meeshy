package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.look.ComposerCropPreset
import org.junit.Test

/**
 * #13849 — **recadrer un média posé ne réécrit aucune image** : le recadrage s'écrit en `MediaCropRect` (`crop` du fil),
 * se garde au brouillon, se relit d'une story rouverte, et chaque lecteur peint la source entière derrière le cadre.
 */
class StoryPlacedMediaCropTest {

    private val crop = StoryMediaCrop(x = 0.1, y = 0.2, width = 0.5, height = 0.4)

    private fun photo(id: String, width: Int = 1000, height: Int = 2000) =
        UploadedMedia(id = id, url = "/u/$id.jpg", mimeType = "image/jpeg", fileSize = 1, width = width, height = height, durationMs = null, thumbnailUrl = null)

    private fun video(id: String) =
        UploadedMedia(id = id, url = "/u/$id.mp4", mimeType = "video/mp4", fileSize = 1, width = 1080, height = 1920, durationMs = 9_000, thumbnailUrl = null)

    private fun withPlaced(vararg media: UploadedMedia): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = media.map { it.id }, placedMedia = media.map { StoryPlacedMedia(it.id) })
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = media.toList())
    }

    private fun StoryComposerUiState.placed(id: String) = deck.selectedSlide.placedMedia.first { it.mediaId == id }

    @Test
    fun `cropping writes the crop on that placed media only, and the whole source writes none`() {
        val base = withPlaced(photo("a"), photo("b"))

        val cropped = StoryComposerPlacedMediaReducer.cropped(base, "a", crop)

        assertThat(cropped.placed("a").crop).isEqualTo(crop)
        assertThat(cropped.placed("b").crop).isNull()
        assertThat(StoryComposerPlacedMediaReducer.cropped(cropped, "a", StoryMediaCrop.FULL).placed("a").crop).isNull()
        assertThat(StoryComposerPlacedMediaReducer.cropped(base, "ghost", crop)).isSameInstanceAs(base)
        assertThat(StoryComposerPlacedMediaReducer.cropped(cropped, "a", crop)).isSameInstanceAs(cropped)
    }

    @Test
    fun `a preset frames the largest centred crop of its proportions, Original gives the source back`() {
        val base = withPlaced(photo("a", width = 1000, height = 2000))

        val square = StoryComposerPlacedMediaReducer.preset(base, "a", ComposerCropPreset.SQUARE)
        val original = StoryComposerPlacedMediaReducer.preset(square, "a", ComposerCropPreset.ORIGINAL)

        val framed = square.placed("a").crop!!
        assertThat(framed.width).isWithin(1e-6).of(1.0)
        assertThat(framed.height).isWithin(1e-6).of(0.5)
        assertThat(framed.y).isWithin(1e-6).of(0.25)
        assertThat(square.placedCropPresetOf("a")).isEqualTo(ComposerCropPreset.SQUARE)
        assertThat(original.placed("a").crop).isNull()
    }

    @Test
    fun `the crop travels on the wire, keeps the measured source ratio, and comes back from a published story`() {
        val placed = StoryPlacedMedia("a", crop = crop)

        val wire = placed.toMediaObject(url = "/u/a.jpg", mimeType = "image/jpeg", durationSeconds = null, aspectRatio = 0.5)

        assertThat(wire.crop).isEqualTo(crop)
        assertThat(wire.aspectRatio).isEqualTo(0.5)
        assertThat(StoryPlacedMedia.foreground(listOf(StoryMediaObject(id = "o", postMediaId = "a", crop = crop))).single().crop).isEqualTo(crop)
    }

    @Test
    fun `the crop survives the draft`() {
        val placed = StoryPlacedMedia("a", crop = crop)

        assertThat(StoryPlacedMedia.from(placed.toDraftSnapshot()).crop).isEqualTo(crop)
    }

    @Test
    fun `the scene frames a cropped media at its effective ratio`() {
        val state = StoryComposerPlacedMediaReducer.cropped(withPlaced(photo("a", width = 1000, height = 2000)), "a", crop)

        val frame = state.placedMediaFrames(mediaBaseUrl = null).single()

        assertThat(frame.aspectRatio).isWithin(1e-9).of(0.5 * (0.5 / 0.4))
        assertThat(frame.placed.crop).isEqualTo(crop)
    }

    @Test
    fun `a placed image offers Crop first, a placed video does not`() {
        val state = withPlaced(photo("a"), video("v"))
        val cropSection = ComposerObjectEditorSection.Media(MediaEditTool.CROP)

        assertThat(state.mediaSectionsFor("a").first()).isEqualTo(cropSection)
        assertThat(state.mediaSectionsFor("v")).doesNotContain(cropSection)
    }
}
