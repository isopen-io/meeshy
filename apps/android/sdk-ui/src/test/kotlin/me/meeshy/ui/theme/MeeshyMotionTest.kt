package me.meeshy.ui.theme

import androidx.compose.animation.core.SpringSpec
import com.google.common.truth.Truth.assertThat
import kotlin.math.PI
import org.junit.Test

/**
 * Les ressorts d'iOS (`Animation.spring(response:dampingFraction:)`) sont portés
 * en `dampingRatio` + `stiffness = (2π / response)²` : un ressort SwiftUI de masse
 * unitaire oscille à la période `response`, donc `k = ω² = (2π / response)²`.
 */
class MeeshyMotionTest {

    private fun expectedStiffness(response: Double): Float =
        ((2.0 * PI / response) * (2.0 * PI / response)).toFloat()

    @Test
    fun `stiffness is the squared angular frequency of the SwiftUI response`() {
        assertThat(MeeshyMotion.stiffnessForResponse(0.25f)).isWithin(0.01f).of(631.65f)
        assertThat(MeeshyMotion.stiffnessForResponse(0.4f)).isWithin(0.01f).of(246.74f)
        assertThat(MeeshyMotion.stiffnessForResponse(0.5f)).isWithin(0.01f).of(157.91f)
    }

    @Test
    fun `a longer response is a softer spring`() {
        assertThat(MeeshyMotion.stiffnessForResponse(0.5f))
            .isLessThan(MeeshyMotion.stiffnessForResponse(0.25f))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `a response of zero is refused instead of dividing by zero`() {
        MeeshyMotion.stiffnessForResponse(0f)
    }

    @Test
    fun `springFast matches iOS response 0,25 damping 0,7`() {
        val spec: SpringSpec<Float> = MeeshyMotion.springFast()
        assertThat(spec.dampingRatio).isEqualTo(0.7f)
        assertThat(spec.stiffness).isWithin(0.01f).of(expectedStiffness(0.25))
    }

    @Test
    fun `springDefault matches iOS response 0,4 damping 0,75`() {
        val spec: SpringSpec<Float> = MeeshyMotion.springDefault()
        assertThat(spec.dampingRatio).isEqualTo(0.75f)
        assertThat(spec.stiffness).isWithin(0.01f).of(expectedStiffness(0.4))
    }

    @Test
    fun `springBouncy matches iOS response 0,5 damping 0,6`() {
        val spec: SpringSpec<Float> = MeeshyMotion.springBouncy()
        assertThat(spec.dampingRatio).isEqualTo(0.6f)
        assertThat(spec.stiffness).isWithin(0.01f).of(expectedStiffness(0.5))
    }

    @Test
    fun `the historic standard and bouncy springs are the iOS default and bouncy ones`() {
        val standard: SpringSpec<Float> = MeeshyMotion.standardSpring()
        val bouncy: SpringSpec<Float> = MeeshyMotion.bouncySpring()
        assertThat(standard).isEqualTo(MeeshyMotion.springDefault<Float>())
        assertThat(bouncy).isEqualTo(MeeshyMotion.springBouncy<Float>())
    }

    @Test
    fun `stagger delay is 0,04 s per index like iOS staggerDelay`() {
        assertThat(MeeshyMotion.STAGGER_STEP_MILLIS).isEqualTo(40)
        assertThat(MeeshyMotion.staggerDelayMillis(0)).isEqualTo(0)
        assertThat(MeeshyMotion.staggerDelayMillis(1)).isEqualTo(40)
        assertThat(MeeshyMotion.staggerDelayMillis(5)).isEqualTo(200)
    }

    @Test
    fun `a negative index never produces a negative delay`() {
        assertThat(MeeshyMotion.staggerDelayMillis(-3)).isEqualTo(0)
    }
}
