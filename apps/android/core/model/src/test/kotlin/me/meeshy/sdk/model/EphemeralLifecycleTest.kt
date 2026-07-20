package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import org.junit.Test

/**
 * Behavioural coverage for the ephemeral (self-destruct) countdown logic — a direct
 * port of iOS `BubbleEphemeralLifecycle` (`BubbleEphemeralLifecycle.swift`):
 *
 * - `evaluate(expiresAt, now)` returns [EphemeralLifecycle.State.None] when there is
 *   no expiry, [EphemeralLifecycle.State.Expired] once the deadline has passed
 *   (`remaining <= 0`), and [EphemeralLifecycle.State.Running] with the remaining
 *   seconds otherwise (iOS `expiresAt.timeIntervalSince(now)`).
 * - `format(remaining)` renders the compact `7s` / `45s` / `1m 05s` / `2h 03m` shape
 *   (iOS `format(remaining:)`) — sub-10s shows the raw seconds, the minute band shows
 *   `Xm YYs`, and the hour band shows `Xh YYm` (seconds dropped once hours appear).
 */
class EphemeralLifecycleTest {

    private val epoch = Instant.ofEpochSecond(1_700_000_000)

    private fun evaluate(expiresAt: Instant?, now: Instant = epoch) =
        EphemeralLifecycle.evaluate(expiresAt = expiresAt, now = now)

    // MARK: - evaluate

    @Test
    fun evaluate_noExpiry_isNone() {
        assertThat(evaluate(expiresAt = null)).isEqualTo(EphemeralLifecycle.State.None)
    }

    @Test
    fun evaluate_futureExpiry_isRunningWithRemaining() {
        val state = evaluate(expiresAt = epoch.plusSeconds(90))
        assertThat(state).isEqualTo(EphemeralLifecycle.State.Running(90.0))
    }

    @Test
    fun evaluate_futureExpiry_carriesSubSecondRemaining() {
        val state = evaluate(expiresAt = epoch.plusMillis(1_500))
        assertThat(state).isEqualTo(EphemeralLifecycle.State.Running(1.5))
    }

    @Test
    fun evaluate_deadlineExactlyNow_isExpired() {
        assertThat(evaluate(expiresAt = epoch)).isEqualTo(EphemeralLifecycle.State.Expired)
    }

    @Test
    fun evaluate_pastExpiry_isExpired() {
        assertThat(evaluate(expiresAt = epoch.minusSeconds(5))).isEqualTo(EphemeralLifecycle.State.Expired)
    }

    // MARK: - format: sub-10s band (raw seconds)

    @Test
    fun format_zero_showsZeroSeconds() {
        assertThat(EphemeralLifecycle.format(0.0)).isEqualTo("0s")
    }

    @Test
    fun format_singleDigitSeconds_showsRawSeconds() {
        assertThat(EphemeralLifecycle.format(7.0)).isEqualTo("7s")
    }

    @Test
    fun format_fractionalSeconds_truncatesTowardZero() {
        assertThat(EphemeralLifecycle.format(9.9)).isEqualTo("9s")
    }

    @Test
    fun format_negativeRemaining_clampsToZero() {
        assertThat(EphemeralLifecycle.format(-42.0)).isEqualTo("0s")
    }

    // MARK: - format: seconds band [10, 59]

    @Test
    fun format_tenSeconds_showsSecondsBand() {
        assertThat(EphemeralLifecycle.format(10.0)).isEqualTo("10s")
    }

    @Test
    fun format_underOneMinute_showsSeconds() {
        assertThat(EphemeralLifecycle.format(45.0)).isEqualTo("45s")
    }

    @Test
    fun format_oneSecondBeforeMinute_showsSeconds() {
        assertThat(EphemeralLifecycle.format(59.0)).isEqualTo("59s")
    }

    // MARK: - format: minute band

    @Test
    fun format_exactlyOneMinute_zeroPadsSeconds() {
        assertThat(EphemeralLifecycle.format(60.0)).isEqualTo("1m 00s")
    }

    @Test
    fun format_minuteWithSeconds_zeroPadsSeconds() {
        assertThat(EphemeralLifecycle.format(65.0)).isEqualTo("1m 05s")
    }

    @Test
    fun format_multipleMinutes_showsMinuteAndSeconds() {
        assertThat(EphemeralLifecycle.format(125.0)).isEqualTo("2m 05s")
    }

    @Test
    fun format_oneSecondBeforeHour_showsMinuteBand() {
        assertThat(EphemeralLifecycle.format(3_599.0)).isEqualTo("59m 59s")
    }

    // MARK: - format: hour band (seconds dropped)

    @Test
    fun format_exactlyOneHour_zeroPadsMinutes() {
        assertThat(EphemeralLifecycle.format(3_600.0)).isEqualTo("1h 00m")
    }

    @Test
    fun format_hoursWithMinutes_dropsSeconds() {
        // 2h 03m 00s — 7380s = 2*3600 + 3*60.
        assertThat(EphemeralLifecycle.format(7_380.0)).isEqualTo("2h 03m")
    }

    @Test
    fun format_hourBand_ignoresLeftoverSeconds() {
        // 1h 01m 01s → seconds are dropped in the hour band, minutes zero-padded.
        assertThat(EphemeralLifecycle.format(3_661.0)).isEqualTo("1h 01m")
    }

    // MARK: - evaluate → format round trip

    @Test
    fun evaluate_thenFormat_rendersRemainingRunningState() {
        val state = evaluate(expiresAt = epoch.plusSeconds(65))
        val remaining = (state as EphemeralLifecycle.State.Running).remainingSeconds
        assertThat(EphemeralLifecycle.format(remaining)).isEqualTo("1m 05s")
    }
}
