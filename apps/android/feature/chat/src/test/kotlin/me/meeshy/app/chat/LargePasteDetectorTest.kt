package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [LargePasteDetector] — the composer rule that turns a sudden
 * large paste into a clipboard-content attachment (port of the iOS
 * `UniversalComposerBar.handleClipboardCheck`).
 *
 * iOS fires when `newText.count > 2000 && delta > 500`, where the obfuscated
 * `delta = 2 * (newText.count - text.count)` is exactly twice the single-edit growth.
 * We port the intent directly: the composer must have grown past
 * [LargePasteDetector.MIN_TOTAL_LENGTH] characters **and** jumped by more than
 * [LargePasteDetector.MIN_GROWTH] characters in one edit (iOS `500 / 2 = 250`).
 */
class LargePasteDetectorTest {

    private val now = 7_000L

    private fun over(total: Int) = "a".repeat(total)

    @Test
    fun `a paste past both thresholds is a large paste`() {
        val detected = LargePasteDetector.isLargePaste(previous = "", current = over(2_001))

        assertThat(detected).isTrue()
    }

    @Test
    fun `a text at exactly the total-length threshold is not a large paste`() {
        val detected = LargePasteDetector.isLargePaste(previous = "", current = over(2_000))

        assertThat(detected).isFalse()
    }

    @Test
    fun `a paste one character over the total threshold with ample growth qualifies`() {
        val detected = LargePasteDetector.isLargePaste(previous = "", current = over(2_001))

        assertThat(detected).isTrue()
    }

    @Test
    fun `growth exactly at the minimum does not qualify`() {
        val previous = over(3_000)
        val current = over(3_000 + LargePasteDetector.MIN_GROWTH)

        val detected = LargePasteDetector.isLargePaste(previous = previous, current = current)

        assertThat(detected).isFalse()
    }

    @Test
    fun `growth one character over the minimum qualifies when past the total length`() {
        val previous = over(3_000)
        val current = over(3_000 + LargePasteDetector.MIN_GROWTH + 1)

        val detected = LargePasteDetector.isLargePaste(previous = previous, current = current)

        assertThat(detected).isTrue()
    }

    @Test
    fun `slowly typed text that crosses the total length is not a paste`() {
        val previous = over(2_400)
        val current = over(2_401)

        val detected = LargePasteDetector.isLargePaste(previous = previous, current = current)

        assertThat(detected).isFalse()
    }

    @Test
    fun `a big paste appended to an already-large composer qualifies`() {
        val previous = over(2_500)
        val current = over(2_500 + 400)

        val detected = LargePasteDetector.isLargePaste(previous = previous, current = current)

        assertThat(detected).isTrue()
    }

    @Test
    fun `a huge jump into a still-short composer does not qualify`() {
        val detected = LargePasteDetector.isLargePaste(previous = "", current = over(1_800))

        assertThat(detected).isFalse()
    }

    @Test
    fun `a deletion is never a large paste`() {
        val previous = over(3_000)
        val current = over(2_100)

        val detected = LargePasteDetector.isLargePaste(previous = previous, current = current)

        assertThat(detected).isFalse()
    }

    @Test
    fun `an unchanged composer is not a large paste`() {
        val text = over(3_000)

        val detected = LargePasteDetector.isLargePaste(previous = text, current = text)

        assertThat(detected).isFalse()
    }

    @Test
    fun `detect returns None when the change is not a large paste`() {
        val detection = LargePasteDetector.detect(previous = "", current = "hi", nowMillis = now)

        assertThat(detection).isEqualTo(PasteDetection.None)
    }

    @Test
    fun `detect captures the full pasted text into a clipboard content`() {
        val current = over(2_001)

        val detection = LargePasteDetector.detect(previous = "", current = current, nowMillis = now)

        assertThat(detection).isInstanceOf(PasteDetection.Captured::class.java)
        val content = (detection as PasteDetection.Captured).content
        assertThat(content.text).isEqualTo(current)
        assertThat(content.charCount).isEqualTo(2_001)
    }

    @Test
    fun `detect stamps the captured content with the injected clock`() {
        val detection = LargePasteDetector.detect(previous = "", current = over(2_001), nowMillis = 55L)

        val content = (detection as PasteDetection.Captured).content
        assertThat(content.createdAtMillis).isEqualTo(55L)
    }
}
