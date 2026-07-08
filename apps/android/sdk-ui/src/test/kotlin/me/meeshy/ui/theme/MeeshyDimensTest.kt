package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeshyDimensTest {

    @Test
    fun `spacing scale follows the 4dp grid`() {
        MeeshySpacing.scale.forEach { step ->
            assertThat(step.value % 4f).isEqualTo(0f)
        }
    }

    @Test
    fun `spacing scale is strictly ascending with no duplicates`() {
        val values = MeeshySpacing.scale.map { it.value }
        assertThat(values).isInStrictOrder()
    }

    @Test
    fun `radius scale is ascending up to the pill`() {
        val values = listOf(
            MeeshyRadius.sm, MeeshyRadius.md, MeeshyRadius.lg, MeeshyRadius.xl, MeeshyRadius.xxl,
        ).map { it.value }
        assertThat(values).isInStrictOrder()
        assertThat(MeeshyRadius.pill.value).isGreaterThan(MeeshyRadius.xxl.value)
    }
}
