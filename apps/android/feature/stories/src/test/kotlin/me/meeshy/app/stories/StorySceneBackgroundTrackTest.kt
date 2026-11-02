package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.timeline.Plan2DLayout
import me.meeshy.sdk.model.composer.timeline.TrackPlane
import org.junit.Test

/**
 * La frise de Temps montre la piste du FOND (#14281, iso iOS `Plan2DLayout.tracks(from: currentEffects)`) : la vidéo ou
 * l'image de fond, sinon la couleur, au plan FOND, en lecture seule — elle dure la diapo.
 */
class StorySceneBackgroundTrackTest {

    private val video = UploadedMedia("v", "https://cdn/v.mp4", "video/mp4", 1, 1080, 1920, 8_000, null)

    @Test
    fun `la video de fond a sa piste au plan fond, verrouillee et sans reglage`() {
        val slide = StorySlide(id = "s", mediaIds = listOf("v"), backgroundMediaId = "v")
        val state = StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = listOf(video))

        val track = state.sceneTracks.single { it.id == "v" }

        assertThat(track.plane).isEqualTo(TrackPlane.BG)
        assertThat(track.isLocked).isTrue()
        assertThat(state.sceneEditableTrackIds).doesNotContain("v")
    }

    @Test
    fun `une couleur de fond a sa piste, une diapo nue n'en a pas`() {
        val colored = StorySlide(id = "s", background = StoryBackgroundValue.Hex("FF0000"))

        assertThat(StoryComposerUiState(deck = StorySlideDeck(listOf(colored), "s")).sceneTracks.map { it.id })
            .contains(Plan2DLayout.BACKGROUND_TRACK_ID)
        assertThat(StoryComposerUiState().sceneTracks.map { it.id }).doesNotContain(Plan2DLayout.BACKGROUND_TRACK_ID)
    }
}
