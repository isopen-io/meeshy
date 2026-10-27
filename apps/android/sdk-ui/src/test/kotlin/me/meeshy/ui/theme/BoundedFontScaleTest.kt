package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BoundedFontScaleTest {

    @Test
    fun `below the ceiling the system scale applies untouched`() {
        assertThat(BoundedFontScale.factor(fontScale = 1.0f, max = 1.15f)).isEqualTo(1f)
        assertThat(BoundedFontScale.factor(fontScale = 1.15f, max = 1.15f)).isEqualTo(1f)
    }

    @Test
    fun `above the ceiling the effective scale stops at the ceiling`() {
        listOf(1.3f, 2.0f).forEach { scale ->
            assertThat(scale * BoundedFontScale.factor(scale, max = 1.15f)).isWithin(1e-5f).of(1.15f)
        }
    }

    @Test
    fun `a ceiling of one makes a size ignore the system scale`() {
        assertThat(1.3f * BoundedFontScale.factor(1.3f, max = 1f)).isWithin(1e-5f).of(1f)
    }

    @Test
    fun `a nonsense scale changes nothing`() {
        assertThat(BoundedFontScale.factor(0f, 1.15f)).isEqualTo(1f)
    }
}
