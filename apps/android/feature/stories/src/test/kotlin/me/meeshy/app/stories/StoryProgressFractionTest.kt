package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryProgressFractionTest {

    private fun commit(raw: Double, current: Float) = StoryPlaybackProgressClock.committedFraction(raw, current)

    @Test
    fun `un écart sous un trois-centième n'est pas publié`() {
        assertThat(commit(0.5 + 1.0 / 600.0, 0.5f)).isNull()
    }

    @Test
    fun `un écart d'un trois-centième ou plus est publié`() {
        assertThat(commit(0.5 + 1.0 / 250.0, 0.5f)).isWithin(1e-6f).of(0.504f)
    }

    @Test
    fun `une valeur identique n'est jamais publiée`() {
        assertThat(commit(0.5, 0.5f)).isNull()
    }

    @Test
    fun `zéro et la fin se publient toujours`() {
        assertThat(commit(0.0, 0.001f)).isEqualTo(0f)
        assertThat(commit(1.0, 0.999f)).isEqualTo(1f)
        assertThat(commit(7.0, 0.999f)).isEqualTo(1f)
    }

    @Test
    fun `une valeur non finie ramène la barre au début`() {
        assertThat(commit(Double.NaN, 0.4f)).isEqualTo(0f)
    }
}
