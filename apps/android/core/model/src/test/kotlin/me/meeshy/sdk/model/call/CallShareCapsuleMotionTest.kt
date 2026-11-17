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

    @Test
    fun `S1-7 - l'appel se contracte VERS la capsule posee en haut, comme iOS (echelle 0,1 ancree en haut au centre)`() {
        val motion = CallShareCapsuleMotion.window(reduceMotion = false, capsuleLive = true)

        assertThat(motion.scale).isEqualTo(0.1f)
        assertThat(motion.pivotX).isEqualTo(0.5f)
        assertThat(motion.pivotY).isEqualTo(0f)
    }

    @Test
    fun `S2-1 et P18-4 - le deploiement part du meme point que la contraction, la ou flotte la capsule`() {
        val toward = CallShareCapsuleMotion.window(reduceMotion = false, capsuleLive = true)
        val from = CallShareCapsuleMotion.window(reduceMotion = false, capsuleLive = true)

        assertThat(from).isEqualTo(toward)
    }

    @Test
    fun `P18-8 - sous reduire les animations, le passage n'est qu'un fondu - ni echelle ni deplacement`() {
        listOf(true, false).forEach { capsuleLive ->
            assertThat(CallShareCapsuleMotion.window(reduceMotion = true, capsuleLive = capsuleLive).scale).isEqualTo(1f)
        }
    }

    @Test
    fun `sans capsule (premier appel, appel termine), l'ecran garde son echelle courte au centre`() {
        val motion = CallShareCapsuleMotion.window(reduceMotion = false, capsuleLive = false)

        assertThat(motion.scale).isEqualTo(CallShareCapsuleMotion.startScale(reduceMotion = false))
        assertThat(motion.pivotX).isEqualTo(0.5f)
        assertThat(motion.pivotY).isEqualTo(0.5f)
    }
}
