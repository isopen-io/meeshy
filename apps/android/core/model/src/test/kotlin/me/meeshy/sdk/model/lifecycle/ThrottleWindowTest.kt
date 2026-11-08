package me.meeshy.sdk.model.lifecycle

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import org.junit.Test

class ThrottleWindowTest {
    private class Clock(var now: Long = 1_000_000L)

    private fun window(clock: Clock) = ThrottleWindow(clock = { clock.now })

    @Test
    fun `a second pass inside ten minutes is refused`() {
        val clock = Clock()
        val window = window(clock)
        assertThat(window.tryEnter()).isTrue()
        window.exit()
        clock.now += 9 * 60 * 1000L
        assertThat(window.tryEnter()).isFalse()
    }

    @Test
    fun `a pass after ten minutes is allowed`() {
        val clock = Clock()
        val window = window(clock)
        window.tryEnter()
        window.exit()
        clock.now += ThrottleWindow.DEFAULT_WINDOW_MILLIS
        assertThat(window.tryEnter()).isTrue()
    }

    @Test
    fun `two passes never overlap even after the window`() {
        val clock = Clock()
        val window = window(clock)
        window.tryEnter()
        clock.now += 60 * 60 * 1000L
        assertThat(window.tryEnter()).isFalse()
    }

    @Test
    fun `runIfDue releases the lock when the block throws`() {
        val clock = Clock()
        val window = window(clock)
        runCatching { runBlocking { window.runIfDue { error("boom") } } }
        clock.now += ThrottleWindow.DEFAULT_WINDOW_MILLIS
        assertThat(runBlocking { window.runIfDue { } }).isTrue()
    }
}
