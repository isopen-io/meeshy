package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileCompletionRingMathTest {

    @Test
    fun `une progression hors bornes est ramenee entre zero et un`() {
        assertThat(ProfileCompletionRingMath.clamp(-0.4f)).isEqualTo(0f)
        assertThat(ProfileCompletionRingMath.clamp(1.7f)).isEqualTo(1f)
        assertThat(ProfileCompletionRingMath.clamp(0.25f)).isEqualTo(0.25f)
    }

    @Test
    fun `une progression non numerique vaut zero`() {
        assertThat(ProfileCompletionRingMath.clamp(Float.NaN)).isEqualTo(0f)
    }

    @Test
    fun `le pourcentage est arrondi vers le bas comme Int() sur iOS`() {
        assertThat(ProfileCompletionRingMath.percent(0.659f)).isEqualTo(65)
        assertThat(ProfileCompletionRingMath.percent(1f)).isEqualTo(100)
        assertThat(ProfileCompletionRingMath.percent(2f)).isEqualTo(100)
        assertThat(ProfileCompletionRingMath.percent(-1f)).isEqualTo(0)
    }

    @Test
    fun `un pourcentage entier devient une progression bornee`() {
        assertThat(ProfileCompletionRingMath.progressOf(42)).isEqualTo(0.42f)
        assertThat(ProfileCompletionRingMath.progressOf(180)).isEqualTo(1f)
        assertThat(ProfileCompletionRingMath.progressOf(-5)).isEqualTo(0f)
    }

    @Test
    fun `l'arc balaye trois cent soixante degres a cent pour cent`() {
        assertThat(ProfileCompletionRingMath.sweepDegrees(1f)).isEqualTo(360f)
        assertThat(ProfileCompletionRingMath.sweepDegrees(0.5f)).isEqualTo(180f)
        assertThat(ProfileCompletionRingMath.sweepDegrees(0f)).isEqualTo(0f)
    }
}
