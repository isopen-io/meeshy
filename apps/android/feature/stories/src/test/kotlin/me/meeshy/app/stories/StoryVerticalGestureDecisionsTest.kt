package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryVerticalGestureDecisionsTest {
    private fun decide(
        translationY: Float,
        predictedY: Float = translationY,
        fullscreen: Boolean = false,
        feature: Boolean = false,
    ) = StoryVerticalGestureDecisions.decide(translationY, predictedY, fullscreen, threshold = 120f, hasActiveFeature = feature)

    @Test
    fun `sous le seuil la carte revient`() {
        assertThat(decide(100f)).isEqualTo(StoryVerticalGestureAction.Cancel)
        assertThat(decide(-100f)).isEqualTo(StoryVerticalGestureAction.Cancel)
    }

    @Test
    fun `le glissé bas fenêtré ferme la story`() {
        assertThat(decide(121f)).isEqualTo(StoryVerticalGestureAction.DismissViewer)
    }

    @Test
    fun `un flick court dont la projection atteint deux seuils et demi ferme`() {
        assertThat(decide(40f, predictedY = 301f)).isEqualTo(StoryVerticalGestureAction.DismissViewer)
        assertThat(decide(40f, predictedY = 299f)).isEqualTo(StoryVerticalGestureAction.Cancel)
    }

    @Test
    fun `le glissé haut fenêtré passe en plein écran`() {
        assertThat(decide(-121f)).isEqualTo(StoryVerticalGestureAction.EnterFullscreen)
        assertThat(decide(-20f, predictedY = -301f)).isEqualTo(StoryVerticalGestureAction.EnterFullscreen)
    }

    @Test
    fun `le glissé bas en plein écran revient au fenêtré sans quitter`() {
        assertThat(decide(200f, fullscreen = true)).isEqualTo(StoryVerticalGestureAction.ExitFullscreen)
    }

    @Test
    fun `le glissé haut en plein écran ne fait rien`() {
        assertThat(decide(-200f, fullscreen = true)).isEqualTo(StoryVerticalGestureAction.None)
    }

    @Test
    fun `une surface ouverte consomme le glissé dans les deux sens`() {
        assertThat(decide(200f, feature = true)).isEqualTo(StoryVerticalGestureAction.DismissActiveFeature)
        assertThat(decide(-200f, feature = true)).isEqualTo(StoryVerticalGestureAction.DismissActiveFeature)
        assertThat(decide(200f, fullscreen = true, feature = true)).isEqualTo(StoryVerticalGestureAction.DismissActiveFeature)
    }

    @Test
    fun `une surface ouverte ne se referme pas sous le seuil`() {
        assertThat(decide(60f, feature = true)).isEqualTo(StoryVerticalGestureAction.Cancel)
    }

    @Test
    fun `seule la fermeture quitte le lecteur`() {
        assertThat(StoryVerticalGestureAction.DismissViewer.toSwipeAction()).isEqualTo(StorySwipeAction.Dismiss)
        StoryVerticalGestureAction.entries.filter { it != StoryVerticalGestureAction.DismissViewer }.forEach {
            assertThat(it.toSwipeAction()).isEqualTo(StorySwipeAction.None)
        }
    }

    @Test
    fun `le chrome est masqué au repos en plein écran et révélé au toucher`() {
        assertThat(StoryFullscreenChrome.chromeVisible(isFullscreen = false, isHeld = false)).isTrue()
        assertThat(StoryFullscreenChrome.chromeVisible(isFullscreen = false, isHeld = true)).isFalse()
        assertThat(StoryFullscreenChrome.chromeVisible(isFullscreen = true, isHeld = false)).isFalse()
        assertThat(StoryFullscreenChrome.chromeVisible(isFullscreen = true, isHeld = true)).isTrue()
    }
}
