package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #17767 — le mouvement entre l'appel plein écran et la capsule de partage (loi 17 : rien n'apparaît ni ne disparaît d'un coup). */
class CallShareCapsuleMotionTest {
    @Test
    fun `le deploiement dure un peu plus que la contraction, comme iOS`() {
        assertThat(CallShareCapsuleMotion.windowFadeMillis(reduceMotion = false, appearing = true)).isEqualTo(220)
        assertThat(CallShareCapsuleMotion.windowFadeMillis(reduceMotion = false, appearing = false)).isEqualTo(180)
    }

    @Test
    fun `reduire les animations remplace tout mouvement par un fondu court, identique dans les deux sens`() {
        val appearing = CallShareCapsuleMotion.windowFadeMillis(reduceMotion = true, appearing = true)
        val leaving = CallShareCapsuleMotion.windowFadeMillis(reduceMotion = true, appearing = false)

        assertThat(appearing).isEqualTo(leaving)
        assertThat(appearing).isLessThan(CallShareCapsuleMotion.windowFadeMillis(reduceMotion = false, appearing = false))
        assertThat(appearing).isGreaterThan(0)
    }

    @Test
    fun `la mise a l'echelle part de 0,92 et disparait sous reduire les animations`() {
        assertThat(CallShareCapsuleMotion.startScale(reduceMotion = false)).isEqualTo(0.92f)
        assertThat(CallShareCapsuleMotion.startScale(reduceMotion = true)).isEqualTo(1f)
    }
}
