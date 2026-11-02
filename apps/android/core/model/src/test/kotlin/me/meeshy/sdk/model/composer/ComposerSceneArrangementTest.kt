package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Grand écran (#13837) : deux rails libellés dès que la place libre à côté d'une scène 9:16 pleine hauteur, Publier sous
 * elle compris, accueille deux rails et leurs marges — la fenêtre décide, jamais le modèle d'appareil.
 */
class ComposerSceneArrangementTest {

    private fun resolve(width: Float, height: Float, previous: ComposerSceneArrangement? = null) =
        ComposerSceneArrangement.resolve(windowWidthDp = width, windowHeightDp = height, previous = previous)

    @Test
    fun `a phone held upright keeps everything on the scene`() {
        assertThat(resolve(360f, 692f)).isEqualTo(ComposerSceneArrangement.OVERLAY)
    }

    @Test
    fun `the same phone turned sideways has room for the two labelled rails`() {
        assertThat(resolve(740f, 330f)).isEqualTo(ComposerSceneArrangement.RAILS)
    }

    @Test
    fun `a ten inch tablet upright is limited by its width and keeps the overlays`() {
        assertThat(resolve(800f, 1232f)).isEqualTo(ComposerSceneArrangement.OVERLAY)
    }

    @Test
    fun `a ten inch tablet sideways lays the rails`() {
        assertThat(resolve(1280f, 752f)).isEqualTo(ComposerSceneArrangement.RAILS)
    }

    @Test
    fun `an unfolded foldable lays the rails`() {
        assertThat(resolve(840f, 900f)).isEqualTo(ComposerSceneArrangement.RAILS)
    }

    @Test
    fun `the scene is sized by the height left once publish and the margins are set under it`() {
        val height = 752f
        val scene = ComposerSceneArrangement.railsSceneHeight(height)

        assertThat(scene).isWithin(0.01f).of(height - ComposerSceneArrangement.PUBLISH_RESERVE - 2 * ComposerSceneArrangement.MARGIN)
        assertThat(ComposerSceneArrangement.freeWidth(1280f, height)).isWithin(0.01f).of(1280f - scene * 9f / 16f)
    }

    @Test
    fun `the threshold is two labelled rails and their margins`() {
        assertThat(ComposerSceneArrangement.THRESHOLD).isWithin(0.01f).of(2 * 112f + 2 * 16f)
    }

    @Test
    fun `a window just under the threshold stays on the overlays, just over it lays the rails`() {
        val height = 700f
        val scene = ComposerSceneArrangement.railsSceneHeight(height) * 9f / 16f
        val edge = scene + ComposerSceneArrangement.THRESHOLD

        assertThat(resolve(edge - 1f, height)).isEqualTo(ComposerSceneArrangement.OVERLAY)
        assertThat(resolve(edge, height)).isEqualTo(ComposerSceneArrangement.RAILS)
    }

    @Test
    fun `once on the rails a window shrinking by less than the hysteresis keeps them, so a split screen does not flicker`() {
        val height = 700f
        val edge = ComposerSceneArrangement.railsSceneHeight(height) * 9f / 16f + ComposerSceneArrangement.THRESHOLD
        val rails = ComposerSceneArrangement.RAILS

        assertThat(resolve(edge - 10f, height, previous = rails)).isEqualTo(rails)
        assertThat(resolve(edge - ComposerSceneArrangement.HYSTERESIS - 1f, height, previous = rails))
            .isEqualTo(ComposerSceneArrangement.OVERLAY)
        assertThat(resolve(edge - 10f, height, previous = ComposerSceneArrangement.OVERLAY))
            .isEqualTo(ComposerSceneArrangement.OVERLAY)
    }

    @Test
    fun `an empty window never lays the rails`() {
        assertThat(resolve(0f, 0f)).isEqualTo(ComposerSceneArrangement.OVERLAY)
        assertThat(resolve(100f, 20f)).isEqualTo(ComposerSceneArrangement.OVERLAY)
    }
}
