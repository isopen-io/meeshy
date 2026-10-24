package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RecentMediaCachingWindowTest {
    private val ids = (0 until 40).map { "a$it" }

    @Test
    fun `window spans two rows before and four rows after the visible cell`() {
        val window = RecentMediaCachingWindow.ids("a20", ids, columns = 4)
        assertThat(window.first()).isEqualTo("a12")
        assertThat(window.last()).isEqualTo("a39")
    }

    @Test
    fun `window is clamped at both ends`() {
        assertThat(RecentMediaCachingWindow.ids("a0", ids, columns = 4).first()).isEqualTo("a0")
        assertThat(RecentMediaCachingWindow.ids("a39", ids, columns = 4).last()).isEqualTo("a39")
    }

    @Test
    fun `unknown cell yields an empty window`() {
        assertThat(RecentMediaCachingWindow.ids("zzz", ids, columns = 4)).isEmpty()
    }

    @Test
    fun `delta starts what enters the window and stops what leaves it`() {
        val delta = RecentMediaCachingWindow.delta(from = listOf("a", "b", "c"), to = listOf("b", "c", "d"))
        assertThat(delta.start).containsExactly("d")
        assertThat(delta.stop).containsExactly("a")
    }

    @Test
    fun `delta between identical windows is empty`() {
        val delta = RecentMediaCachingWindow.delta(listOf("a"), listOf("a"))
        assertThat(delta.start).isEmpty()
        assertThat(delta.stop).isEmpty()
    }
}
