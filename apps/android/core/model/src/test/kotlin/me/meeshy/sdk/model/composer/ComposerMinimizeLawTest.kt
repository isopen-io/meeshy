package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerMinimizeLawTest {
    private fun decide(dy: Float, v: Float = 0f, can: Boolean = true) =
        ComposerMinimizeLaw.decide(dy, v, can)

    @Test fun `le decalage suit le doigt avec une resistance de 0,5`() {
        assertThat(ComposerMinimizeLaw.offsetFor(100f)).isEqualTo(50f)
        assertThat(ComposerMinimizeLaw.offsetFor(-40f)).isEqualTo(0f)
    }

    @Test fun `a 80 dp le lacher replie`() {
        assertThat(decide(80f)).isEqualTo(ComposerMinimizeOutcome.MINIMIZE)
        assertThat(decide(200f)).isEqualTo(ComposerMinimizeOutcome.MINIMIZE)
    }

    @Test fun `sous 80 dp le lacher rebondit`() {
        assertThat(decide(79.9f)).isEqualTo(ComposerMinimizeOutcome.REBOUND)
        assertThat(decide(0f)).isEqualTo(ComposerMinimizeOutcome.REBOUND)
    }

    @Test fun `un geste rapide replie meme court`() {
        assertThat(decide(30f, v = 2_000f)).isEqualTo(ComposerMinimizeOutcome.MINIMIZE)
        assertThat(decide(30f, v = 1_200f)).isEqualTo(ComposerMinimizeOutcome.REBOUND)
    }

    @Test fun `un geste rapide vers le haut ne replie pas`() {
        assertThat(decide(-50f, v = 5_000f)).isEqualTo(ComposerMinimizeOutcome.REBOUND)
    }

    @Test fun `sans repli autorise le geste ferme seulement les surfaces`() {
        assertThat(decide(120f, can = false)).isEqualTo(ComposerMinimizeOutcome.DISMISS_SURFACES)
        assertThat(decide(10f, can = false)).isEqualTo(ComposerMinimizeOutcome.REBOUND)
    }
}
