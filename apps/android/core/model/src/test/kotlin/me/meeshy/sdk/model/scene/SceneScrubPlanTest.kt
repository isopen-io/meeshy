package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneScrubPlanTest {

    @Test
    fun `la fraction pointe un instant de la scène`() {
        assertThat(SceneScrubPlan.seconds(0.5, 10.0)).isEqualTo(5.0)
        assertThat(SceneScrubPlan.millis(0.25, 8_000)).isEqualTo(2_000L)
    }

    @Test
    fun `la fraction est bornée à la scène`() {
        assertThat(SceneScrubPlan.seconds(-1.0, 10.0)).isEqualTo(0.0)
        assertThat(SceneScrubPlan.seconds(3.0, 10.0)).isEqualTo(10.0)
    }

    @Test
    fun `une fraction non finie ou une durée vide valent le début`() {
        assertThat(SceneScrubPlan.seconds(Double.NaN, 10.0)).isEqualTo(0.0)
        assertThat(SceneScrubPlan.seconds(Double.POSITIVE_INFINITY, 10.0)).isEqualTo(0.0)
        assertThat(SceneScrubPlan.seconds(0.5, 0.0)).isEqualTo(0.0)
        assertThat(SceneScrubPlan.seconds(0.5, Double.NaN)).isEqualTo(0.0)
    }

    @Test
    fun `un fond bouclé est calé sur son tour en cours`() {
        assertThat(SceneScrubPlan.loopedTarget(7.0, 3.0)).isEqualTo(1.0)
        assertThat(SceneScrubPlan.backgroundSeekMs(7.0, 3_000, loops = true)).isEqualTo(1_000L)
    }

    @Test
    fun `un fond bouclé de durée inconnue n'est pas calé`() {
        assertThat(SceneScrubPlan.loopedTarget(7.0, 0.0)).isNull()
        assertThat(SceneScrubPlan.backgroundSeekMs(7.0, 0, loops = true)).isNull()
        assertThat(SceneScrubPlan.backgroundSeekMs(7.0, 0, loops = false)).isNull()
    }

    @Test
    fun `un fond non bouclé est calé sur l'instant borné à sa durée`() {
        assertThat(SceneScrubPlan.backgroundSeekMs(2.0, 5_000, loops = false)).isEqualTo(2_000L)
        assertThat(SceneScrubPlan.backgroundSeekMs(9.0, 5_000, loops = false)).isEqualTo(5_000L)
    }

    @Test
    fun `l'accessibilité règle par pas de dix pour cent`() {
        assertThat(SceneScrubPlan.adjusted(0.5, increment = true)).isWithin(1e-9).of(0.6)
        assertThat(SceneScrubPlan.adjusted(0.5, increment = false)).isWithin(1e-9).of(0.4)
        assertThat(SceneScrubPlan.adjusted(0.95, increment = true)).isEqualTo(1.0)
        assertThat(SceneScrubPlan.adjusted(0.05, increment = false)).isEqualTo(0.0)
        assertThat(SceneScrubPlan.adjusted(Double.NaN, increment = true)).isWithin(1e-9).of(0.1)
    }

    @Test
    fun `la position du doigt se projette sur la barre`() {
        assertThat(SceneScrubPlan.fraction(50f, 200f)).isEqualTo(0.25f)
        assertThat(SceneScrubPlan.fraction(-10f, 200f)).isEqualTo(0f)
        assertThat(SceneScrubPlan.fraction(500f, 200f)).isEqualTo(1f)
        assertThat(SceneScrubPlan.fraction(50f, 0f)).isEqualTo(0f)
        assertThat(SceneScrubPlan.fraction(Float.NaN, 200f)).isEqualTo(0f)
    }
}
