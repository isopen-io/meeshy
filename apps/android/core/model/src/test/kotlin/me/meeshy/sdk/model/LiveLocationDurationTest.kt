package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [LiveLocationDuration] — port of iOS `LiveLocationDuration`
 * (`LocationModels.swift`). The five fixed windows (15 min → 8 h), their millisecond
 * offset, the default selection, and the minute → case lookup (with the unmatched fall
 * through to `null`).
 */
class LiveLocationDurationTest {

    @Test
    fun minutes_matchTheIosRawValues() {
        assertThat(LiveLocationDuration.entries.map { it.minutes })
            .containsExactly(15, 30, 60, 120, 480)
            .inOrder()
    }

    @Test
    fun durationMillis_isMinutesTimesSixtyThousand() {
        assertThat(LiveLocationDuration.FIFTEEN_MINUTES.durationMillis).isEqualTo(900_000L)
        assertThat(LiveLocationDuration.ONE_HOUR.durationMillis).isEqualTo(3_600_000L)
        assertThat(LiveLocationDuration.EIGHT_HOURS.durationMillis).isEqualTo(28_800_000L)
    }

    @Test
    fun default_isTheShortestWindow() {
        assertThat(LiveLocationDuration.DEFAULT).isEqualTo(LiveLocationDuration.FIFTEEN_MINUTES)
    }

    @Test
    fun fromMinutes_resolvesAKnownWindow() {
        assertThat(LiveLocationDuration.fromMinutes(120)).isEqualTo(LiveLocationDuration.TWO_HOURS)
    }

    @Test
    fun fromMinutes_unknownWindow_isNull() {
        assertThat(LiveLocationDuration.fromMinutes(45)).isNull()
    }

    @Test
    fun fromMinutes_zeroOrNegative_isNull() {
        assertThat(LiveLocationDuration.fromMinutes(0)).isNull()
        assertThat(LiveLocationDuration.fromMinutes(-15)).isNull()
    }
}
