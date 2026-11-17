package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.sync.ThreadContiguity.Span
import me.meeshy.sdk.model.sync.ThreadContiguity.Sweep
import org.junit.Test

/**
 * #18929, #19114, #19046 (F12) — the contiguity of a thread's held history: where the forward sweep starts, when a
 * conditional request may be sent, and what a revalidation or a backward page proves. Only reads that are contiguous
 * move the watermark; a pushed message, a socket arrival or an acknowledged send never does.
 */
class ThreadContiguityTest {

    // — where the sweep starts —

    @Test
    fun `the sweep starts from the watermark, never from a pushed message held above it`() {
        assertThat(ThreadContiguity(watermark = 100).sweepFrom(heldUpTo = 900)).isEqualTo(100)
    }

    @Test
    fun `a cache written before the watermark existed sweeps from the newest message it holds`() {
        assertThat(ThreadContiguity().sweepFrom(heldUpTo = 900)).isEqualTo(900)
    }

    @Test
    fun `nothing held, no watermark, no sweep`() {
        assertThat(ThreadContiguity().sweepFrom(heldUpTo = null)).isNull()
    }

    // — when If-None-Match may leave (F12) —

    @Test
    fun `a validator is sent while nothing is held beyond the page it describes`() {
        assertThat(ThreadContiguity(watermark = 500).mayRevalidateConditionally(heldUpTo = 500)).isTrue()
    }

    @Test
    fun `a row held beyond the described page sends no validator, so its deletion is seen`() {
        assertThat(ThreadContiguity(watermark = 500).mayRevalidateConditionally(heldUpTo = 501)).isFalse()
    }

    @Test
    fun `a thread with a gap sends no validator, so a 304 never stops the sweep that fills it`() {
        assertThat(ThreadContiguity(watermark = 500, gapTop = 900).mayRevalidateConditionally(heldUpTo = 400)).isFalse()
    }

    @Test
    fun `a cache without watermark sends no validator`() {
        assertThat(ThreadContiguity().mayRevalidateConditionally(heldUpTo = 100)).isFalse()
    }

    // — what a revalidation proves —

    @Test
    fun `a first read of an empty cache makes the window the contiguous history`() {
        val after = ThreadContiguity().afterRevalidation(heldUpTo = null, window = Span(10, 20), sweep = Sweep.Complete)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 20))
    }

    @Test
    fun `a window reaching back to the watermark moves it to its newest message`() {
        val after = ThreadContiguity(watermark = 15).afterRevalidation(heldUpTo = 15, window = Span(10, 20), sweep = Sweep.Complete)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 20))
    }

    @Test
    fun `a complete sweep from the watermark joins the window, and the pushed message above it changes nothing`() {
        val after = ThreadContiguity(watermark = 1).afterRevalidation(heldUpTo = 9, window = Span(12, 20), sweep = Sweep.Complete)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 20))
    }

    @Test
    fun `a sweep stopped at its ceiling keeps the watermark where it stopped and opens a gap under the window`() {
        val after = ThreadContiguity(watermark = 1).afterRevalidation(
            heldUpTo = 1,
            window = Span(1_481, 1_500),
            sweep = Sweep.Ceiling(newestRead = 1_001),
        )

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 1_001, gapTop = 1_481))
    }

    @Test
    fun `a sweep stopped at its ceiling after reaching the window leaves no gap`() {
        val after = ThreadContiguity(watermark = 1).afterRevalidation(
            heldUpTo = 1,
            window = Span(900, 1_000),
            sweep = Sweep.Ceiling(newestRead = 950),
        )

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 1_000))
    }

    @Test
    fun `back to the present lands the window alone, and the gap under it is recorded`() {
        val after = ThreadContiguity(watermark = 100).afterRevalidation(heldUpTo = 100, window = Span(151, 170), sweep = Sweep.Skipped)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 100, gapTop = 151))
    }

    @Test
    fun `a window that covers the recorded gap closes it`() {
        val after = ThreadContiguity(watermark = 100, gapTop = 300).afterRevalidation(
            heldUpTo = 320,
            window = Span(90, 330),
            sweep = Sweep.Complete,
        )

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 330))
    }

    @Test
    fun `an empty window keeps the watermark and forgets the gap`() {
        val after = ThreadContiguity(watermark = 100, gapTop = 300).afterRevalidation(heldUpTo = 320, window = null, sweep = Sweep.Complete)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 100))
    }

    @Test
    fun `a window whose newest went back under the watermark lowers it, never claims more than it read`() {
        val after = ThreadContiguity(watermark = 500).afterRevalidation(heldUpTo = 500, window = Span(300, 480), sweep = Sweep.Complete)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 480))
    }

    // — what a backward page proves (#19114) —

    @Test
    fun `a backward page that stays inside the gap lowers its top`() {
        val after = ThreadContiguity(watermark = 1_001, gapTop = 1_481).afterOlderPage(cursorAt = 1_481, pageOldest = 1_451, exhausted = false)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 1_001, gapTop = 1_451))
    }

    @Test
    fun `a backward page that reaches the watermark closes the gap up to its cursor`() {
        val after = ThreadContiguity(watermark = 1_001, gapTop = 1_011).afterOlderPage(cursorAt = 1_011, pageOldest = 981, exhausted = false)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 1_011))
    }

    @Test
    fun `a backward page with nothing older on the server closes the gap`() {
        val after = ThreadContiguity(watermark = 10, gapTop = 50).afterOlderPage(cursorAt = 50, pageOldest = 40, exhausted = true)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 50))
    }

    @Test
    fun `an empty backward page closes the gap`() {
        val after = ThreadContiguity(watermark = 10, gapTop = 50).afterOlderPage(cursorAt = 50, pageOldest = null, exhausted = true)

        assertThat(after).isEqualTo(ThreadContiguity(watermark = 50))
    }

    @Test
    fun `a backward page without a gap proves nothing new`() {
        val held = ThreadContiguity(watermark = 500)

        assertThat(held.afterOlderPage(cursorAt = 200, pageOldest = 150, exhausted = false)).isEqualTo(held)
    }
}
