package me.meeshy.sdk.theme

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class UserColorCacheTest {

    private fun cache() = UserColorCache()

    @Test
    fun `blended color is 30 percent accent plus 70 percent brand indigo`() {
        val expected = DynamicColorGenerator.blendTwo("E74C3C", 0.30, "6366F1", 0.70)
        assertThat(cache().blendedColor("e74c3c")).isEqualTo(expected)
    }

    @Test
    fun `user color is the deterministic color for the name`() {
        assertThat(cache().colorForUser("Alice")).isEqualTo(DynamicColorGenerator.colorForName("Alice"))
    }

    @Test
    fun `clear leaves the values recomputable and identical`() = runTest {
        val c = cache()
        val before = c.blendedColor("3498DB")
        c.clear()
        assertThat(c.blendedColor("3498DB")).isEqualTo(before)
    }
}
