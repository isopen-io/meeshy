package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeshyDimensTest {

    @Test
    fun `spacing scale is strictly ascending with no duplicates`() {
        val values = MeeshySpacing.scale.map { it.value }
        assertThat(values).isInStrictOrder()
    }

    @Test
    fun `spacing scale carries the half steps iOS uses between the 4dp steps`() {
        val values = MeeshySpacing.scale.map { it.value }
        assertThat(values).containsAtLeast(2f, 6f, 10f, 14f)
        assertThat(values).containsExactly(0f, 2f, 4f, 6f, 8f, 10f, 12f, 14f, 16f, 20f, 24f, 32f).inOrder()
    }

    @Test
    fun `radius scale is strictly ascending up to the pill`() {
        val values = MeeshyRadius.scale.map { it.value }
        assertThat(values).isInStrictOrder()
        assertThat(MeeshyRadius.pill.value).isGreaterThan(MeeshyRadius.scale.last().value)
    }

    @Test
    fun `radius scale lists every iOS step from 4 to 24`() {
        assertThat(MeeshyRadius.scale.map { it.value })
            .containsExactly(4f, 8f, 10f, 12f, 14f, 16f, 18f, 20f, 22f, 24f).inOrder()
    }
}
