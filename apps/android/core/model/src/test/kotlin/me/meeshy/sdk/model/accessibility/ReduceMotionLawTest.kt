package me.meeshy.sdk.model.accessibility

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReduceMotionLawTest {

    @Test
    fun `la reduction vaut le OU du systeme et de l'override applicatif`() {
        assertThat(ReduceMotionLaw.shouldReduce(system = false, userForced = false)).isFalse()
        assertThat(ReduceMotionLaw.shouldReduce(system = true, userForced = false)).isTrue()
        assertThat(ReduceMotionLaw.shouldReduce(system = false, userForced = true)).isTrue()
        assertThat(ReduceMotionLaw.shouldReduce(system = true, userForced = true)).isTrue()
    }

    @Test
    fun `l'override ne peut qu'ajouter de la reduction jamais la retirer`() {
        listOf(false, true).forEach { forced ->
            assertThat(ReduceMotionLaw.shouldReduce(system = true, userForced = forced)).isTrue()
        }
    }

    @Test
    fun `le systeme reduit quand l'echelle d'animation est nulle`() {
        assertThat(ReduceMotionLaw.systemReduces(animatorScale = 0f)).isTrue()
        assertThat(ReduceMotionLaw.systemReduces(animatorScale = 1f)).isFalse()
        assertThat(ReduceMotionLaw.systemReduces(animatorScale = 0.5f)).isFalse()
    }

    @Test
    fun `les reglages d'accessibilite par defaut ne reduisent rien`() {
        assertThat(AccessibilitySettings.DEFAULTS.reduceMotion).isFalse()
    }

    @Test
    fun `les sept ratios de repos de la forme d'onde sont ceux d'iOS`() {
        val ratios = (0..6).map { RestingWaveform.ratio(it) }
        assertThat(ratios).containsExactly(0.30f, 0.72f, 0.45f, 1.00f, 0.38f, 0.86f, 0.55f).inOrder()
    }

    @Test
    fun `la forme d'onde de repos est periodique et sure sur tout entier`() {
        assertThat(RestingWaveform.ratio(7)).isEqualTo(RestingWaveform.ratio(0))
        assertThat(RestingWaveform.ratio(Int.MIN_VALUE)).isIn(listOf(0.30f, 0.72f, 0.45f, 1.00f, 0.38f, 0.86f, 0.55f))
    }

    @Test
    fun `la hauteur de repos reste dans le gabarit de la barre animee`() {
        assertThat(RestingWaveform.height(index = 3, minHeight = 3f, maxHeight = 25f)).isEqualTo(25f)
        assertThat(RestingWaveform.height(index = 0, minHeight = 3f, maxHeight = 25f)).isWithin(1e-4f).of(9.6f)
    }

    @Test
    fun `les constantes de micro animation sont celles d'iOS`() {
        assertThat(MotionSpecs.PRESSABLE_SCALE).isEqualTo(0.93f)
        assertThat(MotionSpecs.BOUNCE_ON_TAP_SCALE).isEqualTo(0.92f)
        assertThat(MotionSpecs.BOUNCE_ON_FOCUS_SCALE).isEqualTo(1.02f)
        assertThat(MotionSpecs.BOUNCE_ON_APPEAR_FROM).isEqualTo(0.5f)
        assertThat(MotionSpecs.STAGGER_STEP_MILLIS).isEqualTo(50)
        assertThat(MotionSpecs.STAGGER_OFFSET_DP).isEqualTo(20f)
        assertThat(MotionSpecs.STAGGER_FROM_SCALE).isEqualTo(0.95f)
        assertThat(MotionSpecs.FLOATING_RANGE_DP).isEqualTo(15f)
        assertThat(MotionSpecs.FLOATING_PERIOD_MILLIS).isEqualTo(4000)
        assertThat(MotionSpecs.PULSE_INTENSITY).isEqualTo(0.04f)
    }

    @Test
    fun `sous reduction les echelles pressees valent un`() {
        assertThat(MotionSpecs.pressScale(pressed = true, target = 0.93f, reduce = true)).isEqualTo(1f)
        assertThat(MotionSpecs.pressScale(pressed = true, target = 0.93f, reduce = false)).isEqualTo(0.93f)
        assertThat(MotionSpecs.pressScale(pressed = false, target = 0.93f, reduce = false)).isEqualTo(1f)
    }

    @Test
    fun `sous reduction l'apparition etagee est immediate et sans decalage`() {
        val reduced = MotionSpecs.staggeredAppear(index = 3, visible = false, reduce = true)
        assertThat(reduced).isEqualTo(MotionSpecs.AppearState(alpha = 1f, offsetDp = 0f, scale = 1f, delayMillis = 0))
        val hidden = MotionSpecs.staggeredAppear(index = 3, visible = false, reduce = false)
        assertThat(hidden).isEqualTo(MotionSpecs.AppearState(alpha = 0f, offsetDp = 20f, scale = 0.95f, delayMillis = 150))
        val shown = MotionSpecs.staggeredAppear(index = 3, visible = true, reduce = false)
        assertThat(shown.alpha).isEqualTo(1f)
        assertThat(shown.offsetDp).isEqualTo(0f)
        assertThat(shown.scale).isEqualTo(1f)
    }

    @Test
    fun `le rebond d'apparition part de 0,5 et vaut un sous reduction`() {
        assertThat(MotionSpecs.bounceOnAppear(visible = false, reduce = false).scale).isEqualTo(0.5f)
        assertThat(MotionSpecs.bounceOnAppear(visible = false, reduce = true))
            .isEqualTo(MotionSpecs.AppearState(alpha = 1f, offsetDp = 0f, scale = 1f, delayMillis = 0))
    }

    @Test
    fun `le flottement et la pulsation s'arretent sous reduction`() {
        assertThat(MotionSpecs.floatingActive(reduce = true)).isFalse()
        assertThat(MotionSpecs.floatingActive(reduce = false)).isTrue()
        assertThat(MotionSpecs.pulseActive(reduce = true)).isFalse()
        assertThat(MotionSpecs.pulseActive(reduce = false)).isTrue()
    }

    @Test
    fun `la pulsation grossit de l'intensite et le flottement suit l'ellipse d'iOS`() {
        assertThat(MotionSpecs.pulseScale(pulsing = true, intensity = 0.04f)).isEqualTo(1.04f)
        assertThat(MotionSpecs.pulseScale(pulsing = false, intensity = 0.04f)).isEqualTo(1f)
        assertThat(MotionSpecs.floatingOffsetDp(floating = true, range = 15f)).isEqualTo(15f to -10.5f)
        assertThat(MotionSpecs.floatingOffsetDp(floating = false, range = 15f)).isEqualTo(-15f to 10.5f)
    }
}
