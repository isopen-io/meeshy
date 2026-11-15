package me.meeshy.ui.story.canvas

import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.SceneRootPose
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneRootTransitionRobolectricTest {

    private fun bounds(coverage: Double) =
        (SceneRevealShape(coverage).createOutline(Size(300f, 400f), LayoutDirection.Ltr, Density(1f)) as Outline.Generic).path.getBounds()

    @Test
    fun `le masque circulaire part d un point au centre`() {
        val b = bounds(0.0)
        assertThat(b.width).isWithin(0.01f).of(2f)
        assertThat(b.center.x).isWithin(0.01f).of(150f)
        assertThat(b.center.y).isWithin(0.01f).of(200f)
    }

    @Test
    fun `le masque circulaire recouvre tout le canvas a la fin`() {
        val b = bounds(1.0)
        assertThat(b.width).isWithin(0.1f).of(500f)
    }

    @Test
    fun `la pose neutre ne change pas le modificateur`() {
        val m = androidx.compose.ui.Modifier
        assertThat(m.sceneRootTransition(SceneRootPose.NEUTRAL)).isSameInstanceAs(m)
        assertThat(m.sceneRootTransition(SceneRootPose(opacity = 0.5))).isNotSameInstanceAs(m)
    }
}
