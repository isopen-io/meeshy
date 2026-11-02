package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.timeline.TrackBar
import org.junit.Test

/** « Couper » à la tête dans la frise (#14221, iso iOS `splitSelectedAtPlayhead`) : un texte devient deux objets qui se suivent. */
class StoryComposerFriseSplitTest {

    private fun text(start: Float, duration: Float, playhead: Float): StoryComposerUiState =
        StoryComposerSceneReducer.playheadMoved(
            StoryComposerSceneReducer.windowed(StoryComposerTextReducer.added(StoryComposerUiState(), "t1"), "t1", start, duration),
            playhead,
        )

    private fun bar(state: StoryComposerUiState, id: String) = state.sceneTracks.single { it.id == id }.bar

    @Test
    fun `couper un texte a la tete le partage en deux objets qui se suivent, au meme endroit`() {
        val before = text(start = 1f, duration = 3f, playhead = 2.5f)

        val after = StoryComposerSceneReducer.textSplit(before, "t1", "t2")

        assertThat(bar(after, "t1")).isEqualTo(TrackBar.Timed(1.0, 2.5))
        assertThat(bar(after, "t2")).isEqualTo(TrackBar.Timed(2.5, 4.0))
        val elements = after.deck.selectedSlide.elements.associateBy { it.id }
        assertThat(elements.getValue("t2").x).isEqualTo(elements.getValue("t1").x)
        assertThat(elements.getValue("t2").y).isEqualTo(elements.getValue("t1").y)
        assertThat(elements.getValue("t2").text).isEqualTo(elements.getValue("t1").text)
    }

    @Test
    fun `la tete hors de la fenetre ne coupe rien`() {
        val before = text(start = 1f, duration = 3f, playhead = 0.5f)

        assertThat(StoryComposerSceneReducer.textSplit(before, "t1", "t2")).isEqualTo(before)
    }

    @Test
    fun `un objet qui n'est pas un texte ne se coupe pas`() {
        val before = text(start = 1f, duration = 3f, playhead = 2f)

        assertThat(StoryComposerSceneReducer.textSplit(before, "absent", "t2")).isEqualTo(before)
    }
}
