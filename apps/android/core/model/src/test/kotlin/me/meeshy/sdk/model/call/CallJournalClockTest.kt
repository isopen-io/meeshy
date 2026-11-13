package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * #17342, P6.4 — l'heure d'une phrase est celle de l'APPEL (mm:ss depuis son début, h:mm:ss au-delà), la même pour la
 * ligne du journal vivant, la ligne de capture et le journal d'après l'appel — iOS `CallJournalClock`.
 */
class CallJournalClockTest {
    private val start = 1_000_000L

    @Test
    fun `the label is the time since the call started`() {
        assertThat(CallJournalClock.label(atMs = start + 75_000, startedAtMs = start)).isEqualTo("01:15")
        assertThat(CallJournalClock.label(atMs = start, startedAtMs = start)).isEqualTo("00:00")
    }

    @Test
    fun `past an hour the label widens to h colon mm colon ss`() {
        assertThat(CallJournalClock.label(atMs = start + 3_725_000, startedAtMs = start)).isEqualTo("1:02:05")
    }

    @Test
    fun `a sentence stamped before the start of the call reads zero`() {
        assertThat(CallJournalClock.label(atMs = start - 3_000, startedAtMs = start)).isEqualTo("00:00")
    }

    @Test
    fun `without a start of the call there is no hour rather than a wall clock that would not say the same thing`() {
        assertThat(CallJournalClock.label(atMs = start, startedAtMs = null)).isNull()
    }

    @Test
    fun `a line is dated by the time in the call, its capture clock untouched`() {
        val line = CallLiveCaptionLine(
            key = "j1", speakerId = "peer", speakerName = "Awa", isLocal = false, text = "Salut", languageTag = null,
            isFinal = true, capturedAtMs = start + 75_000, isShowingOriginal = true, canRevealOriginal = false,
        )

        assertThat(line.dated(startedAtMs = start).timeLabel).isEqualTo("01:15")
        assertThat(line.dated(startedAtMs = start).capturedAtMs).isEqualTo(start + 75_000)
        assertThat(line.dated(startedAtMs = null).timeLabel).isNull()
    }
}
