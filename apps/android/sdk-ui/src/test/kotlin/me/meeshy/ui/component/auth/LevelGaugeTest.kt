package me.meeshy.ui.component.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LevelGaugeTest {
    @Test
    fun `la jauge se remplit au prorata des points`() {
        assertThat(levelGaugeFraction(points = 3, threshold = 10)).isEqualTo(0.3f)
    }

    @Test
    fun `la jauge ne depasse jamais pleine et ignore les points negatifs`() {
        assertThat(levelGaugeFraction(points = 25, threshold = 10)).isEqualTo(1f)
        assertThat(levelGaugeFraction(points = -4, threshold = 10)).isEqualTo(0f)
    }

    @Test
    fun `un seuil nul dit la jauge pleine`() {
        assertThat(levelGaugeFraction(points = 0, threshold = 0)).isEqualTo(1f)
    }
}
