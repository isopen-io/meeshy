package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryGestureDecisionsTest {
    private val width = 1000f
    private fun ctx(
        hold: Boolean = false, paused: Boolean = false, resuming: Boolean = false,
        composer: Boolean = false, surface: Boolean = false, slop: Boolean = false,
    ) = StoryGestureContext(hold, paused, resuming, composer, surface, slop)

    private fun up(c: StoryGestureContext, x: Float, elapsed: Long = 50) =
        StoryGestureDecisions.decideTouchUp(c, x, width, elapsed)

    @Test fun `le bord gauche precedent le bord droit suivant le centre rien`() {
        assertThat(up(ctx(), 100f)).isEqualTo(StoryGestureAction.NavigatePrevious)
        assertThat(up(ctx(), 900f)).isEqualTo(StoryGestureAction.NavigateNext)
        assertThat(up(ctx(), 500f)).isEqualTo(StoryGestureAction.None)
        assertThat(up(ctx(), 299f)).isEqualTo(StoryGestureAction.NavigatePrevious)
        assertThat(up(ctx(), 700f)).isEqualTo(StoryGestureAction.NavigateNext)
    }

    @Test fun `un glisse au dela du slop n'est pas un tap`() {
        assertThat(up(ctx(slop = true), 100f)).isEqualTo(StoryGestureAction.None)
    }

    @Test fun `un appui tenu confirme garde la pause et ne navigue pas`() {
        assertThat(up(ctx(hold = true), 100f, 400)).isEqualTo(StoryGestureAction.ConfirmLongPressPause)
        assertThat(up(ctx(), 100f, 250)).isEqualTo(StoryGestureAction.None)
    }

    @Test fun `le toucher de reprise est consomme`() {
        assertThat(StoryGestureDecisions.decideTouchDown(ctx(paused = true), 100f, width))
            .isEqualTo(StoryGestureAction.ResumeFromPause)
        assertThat(up(ctx(resuming = true), 100f)).isEqualTo(StoryGestureAction.None)
    }

    @Test fun `le centre ne reprend pas au toucher et un lecteur en lecture non plus`() {
        assertThat(StoryGestureDecisions.decideTouchDown(ctx(paused = true), 500f, width))
            .isEqualTo(StoryGestureAction.None)
        assertThat(StoryGestureDecisions.decideTouchDown(ctx(), 100f, width)).isEqualTo(StoryGestureAction.None)
    }

    @Test fun `une surface ouverte est refermee sans naviguer`() {
        assertThat(up(ctx(surface = true), 100f)).isEqualTo(StoryGestureAction.CloseSurface)
        assertThat(up(ctx(surface = true), 900f)).isEqualTo(StoryGestureAction.CloseSurface)
        assertThat(StoryGestureDecisions.decideTouchDown(ctx(paused = true, surface = true), 100f, width))
            .isEqualTo(StoryGestureAction.None)
    }

    @Test fun `le composeur engage passe avant tout`() {
        assertThat(up(ctx(composer = true, surface = true), 100f)).isEqualTo(StoryGestureAction.DismissComposer)
        assertThat(StoryGestureDecisions.decideDoubleTap(ctx(composer = true), 500f, width))
            .isEqualTo(StoryGestureAction.DismissComposer)
        assertThat(StoryGestureDecisions.decideTouchDown(ctx(paused = true, composer = true), 100f, width))
            .isEqualTo(StoryGestureAction.None)
    }

    @Test fun `le double toucher bascule la pause au centre seulement`() {
        assertThat(StoryGestureDecisions.decideDoubleTap(ctx(), 500f, width)).isEqualTo(StoryGestureAction.TogglePause)
        assertThat(StoryGestureDecisions.decideDoubleTap(ctx(), 100f, width)).isEqualTo(StoryGestureAction.None)
    }
}
