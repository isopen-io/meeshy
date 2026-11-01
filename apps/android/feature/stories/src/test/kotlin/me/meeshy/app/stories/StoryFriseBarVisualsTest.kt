package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/** Vignettes et forme d'onde dans les barres de la frise (#14220, iso iOS #14214). */
class StoryFriseBarVisualsTest {

    private fun file(id: String, mime: String, durationMs: Long?) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = mime, fileSize = 1, width = 10, height = 10, durationMs = durationMs, thumbnailUrl = null)

    private fun state(vararg files: UploadedMedia, audio: List<StoryAudioPlayerObject> = emptyList()): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = files.map { it.id }, placedMedia = files.map { StoryPlacedMedia(it.id) }, audio = audio)
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = files.toList())
    }

    @Test
    fun `une video posee deroule les vignettes de sa source`() {
        val visuals = state(file("v1", "video/mp4", 12_000L)).friseBarVisuals()

        assertThat(visuals).containsExactly("v1", FriseBarVisual.Filmstrip("https://cdn/v1", 12.0))
    }

    @Test
    fun `une copie de video montre le meme fichier`() {
        val base = state(file("v1", "video/mp4", 12_000L))
        val slide = base.deck.selectedSlide
        val copied = base.copy(deck = base.deck.copy(slides = listOf(slide.copy(placedMedia = slide.placedMedia + StoryPlacedMedia("v1", id = "v2")))))

        assertThat(copied.friseBarVisuals()["v2"]).isEqualTo(FriseBarVisual.Filmstrip("https://cdn/v1", 12.0))
    }

    @Test
    fun `un son montre sa forme d'onde, le fond et un son muet de mesure ne montrent rien`() {
        val visuals = state(
            audio = listOf(
                StoryAudioPlayerObject(id = "a1", waveformSamples = listOf(0.2f, 0.8f)),
                StoryAudioPlayerObject(id = "a2"),
                StoryAudioPlayerObject(id = "bg", isBackground = true, waveformSamples = listOf(0.5f)),
            ),
        ).friseBarVisuals()

        assertThat(visuals).containsExactly("a1", FriseBarVisual.Waveform(listOf(0.2f, 0.8f)))
    }

    @Test
    fun `une image et une video de duree inconnue ne montrent que leur couleur`() {
        assertThat(state(file("i1", "image/jpeg", null), file("v1", "video/mp4", null)).friseBarVisuals()).isEmpty()
    }
}
