package me.meeshy.ui.component.people

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScrollOffsetReporterTest {

    private fun progress(active: Boolean = true, index: Int = 0, offset: Int = 0, threshold: Int = 100) =
        ScrollOffsetReporting.progress(active, index, offset, threshold)

    @Test
    fun `at the top the progress is zero`() {
        assertThat(progress()).isEqualTo(0f)
    }

    @Test
    fun `half the threshold scrolled reports one half`() {
        assertThat(progress(offset = 50)).isEqualTo(0.5f)
    }

    @Test
    fun `past the first item the progress is fully collapsed`() {
        assertThat(progress(index = 1, offset = 0)).isEqualTo(1f)
    }

    @Test
    fun `the progress is capped at one`() {
        assertThat(progress(offset = 900)).isEqualTo(1f)
    }

    @Test
    fun `an inactive tab reports nothing`() {
        assertThat(progress(active = false, index = 3, offset = 40)).isNull()
    }
}
