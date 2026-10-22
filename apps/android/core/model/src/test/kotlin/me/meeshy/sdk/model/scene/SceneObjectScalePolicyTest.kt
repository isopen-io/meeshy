package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Une borne, tous les gestes : jusqu'où un objet de scène grandit et rapetisse.
 * Port de `SceneObjectScalePolicy` (iOS, #4722).
 */
@RunWith(JUnit4::class)
class SceneObjectScalePolicyTest {

    @Test
    fun `les bornes sont 0,3 et 4`() {
        assertThat(SceneObjectScalePolicy.MIN_SCALE).isEqualTo(0.3)
        assertThat(SceneObjectScalePolicy.MAX_SCALE).isEqualTo(4.0)
    }

    @Test
    fun `une echelle trop petite est ramenee a la borne basse`() {
        assertThat(SceneObjectScalePolicy.clamped(0.05)).isEqualTo(0.3)
        assertThat(SceneObjectScalePolicy.clamped(0.299)).isEqualTo(0.3)
    }

    @Test
    fun `une echelle trop grande est ramenee a la borne haute`() {
        assertThat(SceneObjectScalePolicy.clamped(10.0)).isEqualTo(4.0)
        assertThat(SceneObjectScalePolicy.clamped(4.001)).isEqualTo(4.0)
    }

    @Test
    fun `une echelle valide traverse intacte`() {
        assertThat(SceneObjectScalePolicy.clamped(1.0)).isEqualTo(1.0)
        assertThat(SceneObjectScalePolicy.clamped(2.5)).isEqualTo(2.5)
        assertThat(SceneObjectScalePolicy.clamped(0.3)).isEqualTo(0.3)
        assertThat(SceneObjectScalePolicy.clamped(4.0)).isEqualTo(4.0)
    }

    @Test
    fun `NaN et les infinis reviennent a l identite`() {
        assertThat(SceneObjectScalePolicy.clamped(Double.NaN)).isEqualTo(1.0)
        assertThat(SceneObjectScalePolicy.clamped(Double.POSITIVE_INFINITY)).isEqualTo(1.0)
        assertThat(SceneObjectScalePolicy.clamped(Double.NEGATIVE_INFINITY)).isEqualTo(1.0)
    }

    @Test
    fun `zero et une valeur negative reviennent a l identite et non a la borne basse`() {
        assertThat(SceneObjectScalePolicy.clamped(0.0)).isEqualTo(1.0)
        assertThat(SceneObjectScalePolicy.clamped(-2.0)).isEqualTo(1.0)
    }

    @Test
    fun `le geste compose et borne en un seul appel`() {
        assertThat(SceneObjectScalePolicy.settled(base = 1.0, gestureScale = 2.0)).isEqualTo(2.0)
        assertThat(SceneObjectScalePolicy.settled(base = 2.0, gestureScale = 10.0)).isEqualTo(4.0)
        assertThat(SceneObjectScalePolicy.settled(base = 1.0, gestureScale = 0.01)).isEqualTo(0.3)
    }

    @Test
    fun `un facteur de geste degenere ne fait pas disparaitre l objet`() {
        assertThat(SceneObjectScalePolicy.settled(base = 2.0, gestureScale = 0.0)).isEqualTo(1.0)
        assertThat(SceneObjectScalePolicy.settled(base = 2.0, gestureScale = Double.NaN)).isEqualTo(1.0)
    }

    @Test
    fun `les gestes en Float obeissent aux memes bornes`() {
        assertThat(SceneObjectScalePolicy.clamped(0.05f)).isEqualTo(0.3f)
        assertThat(SceneObjectScalePolicy.clamped(9f)).isEqualTo(4f)
        assertThat(SceneObjectScalePolicy.clamped(Float.NaN)).isEqualTo(1f)
        assertThat(SceneObjectScalePolicy.settled(base = 2f, gestureScale = 10f)).isEqualTo(4f)
    }
}
