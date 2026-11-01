package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.timeline.TrackBar
import org.junit.Test

/** Couper une vidéo ou un son depuis la frise (#14221, #14224) : la seconde moitié reprend la source au point de coupe. */
class StoryComposerSplitSourceTest {

    private fun video(durationMs: Long? = 20_000L, sourceStart: Double? = null, sourceEnd: Double? = null): StoryComposerUiState {
        val slide = StorySlide(id = "s", mediaIds = listOf("v1"), placedMedia = listOf(StoryPlacedMedia("v1", sourceStart = sourceStart, sourceEnd = sourceEnd)))
        val file = UploadedMedia(id = "v1", url = "https://cdn/v1", mimeType = "video/mp4", fileSize = 1, width = 10, height = 10, durationMs = durationMs, thumbnailUrl = null)
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = listOf(file))
    }

    private fun sound(sourceStart: Float? = null, sourceEnd: Float? = null): StoryComposerUiState {
        val slide = StorySlide(id = "s", audio = listOf(StoryAudioPlayerObject(id = "a1", sourceStart = sourceStart, sourceEnd = sourceEnd)), soundSources = mapOf("a1" to 30f))
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"))
    }

    private fun at(state: StoryComposerUiState, id: String, start: Float, duration: Float, playhead: Float) =
        StoryComposerSceneReducer.playheadMoved(StoryComposerSceneReducer.windowed(state, id, start, duration), playhead)

    private fun bar(state: StoryComposerUiState, id: String) = state.sceneTracks.single { it.id == id }.bar

    private fun placed(state: StoryComposerUiState, id: String) = state.deck.selectedSlide.placedMedia.single { it.id == id }

    @Test
    fun `couper une video rognee fait jouer la suite de la source a la seconde moitie`() {
        val before = at(video(sourceStart = 3.0, sourceEnd = 11.0), "v1", start = 1f, duration = 4f, playhead = 3f)

        val after = StoryComposerSplitReducer.split(before, "v1", "v2")

        assertThat(bar(after, "v1")).isEqualTo(TrackBar.Timed(1.0, 3.0))
        assertThat(bar(after, "v2")).isEqualTo(TrackBar.Timed(3.0, 5.0))
        assertThat(placed(after, "v1").sourceStart to placed(after, "v1").sourceEnd).isEqualTo(3.0 to 5.0)
        assertThat(placed(after, "v2").sourceStart to placed(after, "v2").sourceEnd).isEqualTo(5.0 to 11.0)
        assertThat(placed(after, "v2").mediaId).isEqualTo("v1")
    }

    @Test
    fun `couper une video entiere borne ses deux moitiés dans la source`() {
        val before = at(video(), "v1", start = 0f, duration = 5f, playhead = 4f)

        val after = StoryComposerSplitReducer.split(before, "v1", "v2")

        assertThat(placed(after, "v1").sourceStart to placed(after, "v1").sourceEnd).isEqualTo(0.0 to 4.0)
        assertThat(placed(after, "v2").sourceStart to placed(after, "v2").sourceEnd).isEqualTo(4.0 to 20.0)
    }

    @Test
    fun `une video de duree inconnue ne s'offre pas a la coupe`() {
        val before = at(video(durationMs = null), "v1", start = 0f, duration = 10f, playhead = 4f)

        assertThat(StoryComposerSplitReducer.splittableIds(before)).doesNotContain("v1")
        assertThat(StoryComposerSplitReducer.split(before, "v1", "v2")).isEqualTo(before)
    }

    @Test
    fun `couper un son fait reprendre sa source au point de coupe`() {
        val before = at(sound(sourceStart = 2f, sourceEnd = 20f), "a1", start = 1f, duration = 4f, playhead = 3f)

        val after = StoryComposerSplitReducer.split(before, "a1", "a2")

        val audio = after.deck.selectedSlide.audio.associateBy { it.id }
        assertThat(audio.getValue("a1").sourceStart to audio.getValue("a1").sourceEnd).isEqualTo(2f to 4f)
        assertThat(audio.getValue("a2").sourceStart to audio.getValue("a2").sourceEnd).isEqualTo(4f to 20f)
        assertThat(bar(after, "a2")).isEqualTo(TrackBar.Timed(3.0, 5.0))
        assertThat(after.deck.selectedSlide.soundSources["a2"]).isEqualTo(30f)
    }

    @Test
    fun `un son sans bornes garde une fin ouverte sur sa seconde moitie`() {
        val before = at(sound(), "a1", start = 0f, duration = 6f, playhead = 2.5f)

        val audio = StoryComposerSplitReducer.split(before, "a1", "a2").deck.selectedSlide.audio.associateBy { it.id }

        assertThat(audio.getValue("a1").sourceStart to audio.getValue("a1").sourceEnd).isEqualTo(0f to 2.5f)
        assertThat(audio.getValue("a2").sourceStart to audio.getValue("a2").sourceEnd).isEqualTo(2.5f to null)
    }

    @Test
    fun `les textes, videos de duree connue et sons se coupent`() {
        val state = video()

        assertThat(StoryComposerSplitReducer.splittableIds(state)).containsExactly("v1")
        assertThat(StoryComposerSplitReducer.splittableIds(sound())).containsExactly("a1")
    }
}
