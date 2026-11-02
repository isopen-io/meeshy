package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.MediaUploadResponse
import me.meeshy.sdk.model.composer.timeline.TrackPlane
import me.meeshy.sdk.model.toUploadedMedia
import org.junit.Test

/**
 * Recette S8 du 2026-11-01 (#14280, #14281) : le chemin RÉEL, de la réponse du téléversement à la frise. Une vidéo choisie
 * sur une diapo vierge est PEINTE en fond sans être désignée (`backgroundMediaId` reste nul) : la durée de la diapo et la
 * piste du fond lisent le fond PEINT, celui que l'auteur voit, jamais seulement le fond désigné.
 */
class StorySceneBackdropRealPathTest {

    private val json = Json { ignoreUnknownKeys = true }

    private val response = """
        {"attachments":[{"id":"6724a1","fileUrl":"/u/20261031_131911.mp4","mimeType":"video/mp4","fileSize":5242880,
        "width":1920,"height":1080,"duration":8218,"thumbnailUrl":null,"fileName":"20261031_131911.mp4"}]}
    """.trimIndent()

    private fun uploaded() = json.decodeFromString(MediaUploadResponse.serializer(), response).attachments.mapNotNull { it.toUploadedMedia() }

    private fun picked(asBackground: Boolean): StoryComposerUiState {
        val fresh = StoryComposerUploadReducer.started(StoryComposerUiState(), count = 1, asBackground = asBackground)
        return StoryComposerUploadReducer.uploaded(fresh, uploaded(), asBackground)
    }

    @Test
    fun `une video choisie sur une diapo vierge donne sa duree a la diapo`() {
        assertThat(picked(asBackground = false).selectedSlideDurationSeconds).isWithin(0.001).of(8.218)
        assertThat(picked(asBackground = true).selectedSlideDurationSeconds).isWithin(0.001).of(8.218)
    }

    @Test
    fun `la video peinte en fond a sa piste au plan fond dans la frise`() {
        val state = picked(asBackground = false)

        val track = state.sceneTracks.single { it.id == "6724a1" }

        assertThat(track.plane).isEqualTo(TrackPlane.BG)
        assertThat(track.isLocked).isTrue()
        assertThat(state.sceneEditableTrackIds).doesNotContain("6724a1")
    }

    @Test
    fun `une video en file d'envoi donne deja sa duree et sa piste`() {
        val item = MediaUploadItem(ByteArray(4), "20261031_131911.mp4", "video/mp4", durationMs = 8218)
        val fresh = StoryComposerUploadReducer.started(StoryComposerUiState(), count = 1)
        val queued = StoryComposerUploadReducer.queued(fresh, "cmid-1", item)

        assertThat(queued.selectedSlideDurationSeconds).isWithin(0.001).of(8.218)
        assertThat(queued.sceneTracks.single { it.id == "cmid-1" }.plane).isEqualTo(TrackPlane.BG)
    }
}
