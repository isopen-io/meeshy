package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class IsoTimeTest {

    // MARK: - isoToEpochMillisOrNull

    @Test
    fun `isoToEpochMillisOrNull returns null for a null value`() {
        assertThat(isoToEpochMillisOrNull(null)).isNull()
    }

    @Test
    fun `isoToEpochMillisOrNull returns null for a blank value`() {
        assertThat(isoToEpochMillisOrNull("   ")).isNull()
    }

    @Test
    fun `isoToEpochMillisOrNull returns null for an unparseable value`() {
        assertThat(isoToEpochMillisOrNull("not-a-timestamp")).isNull()
    }

    @Test
    fun `isoToEpochMillisOrNull parses a UTC instant`() {
        assertThat(isoToEpochMillisOrNull("1970-01-01T00:00:01Z")).isEqualTo(1_000L)
    }

    @Test
    fun `isoToEpochMillisOrNull parses an offset date-time`() {
        // 2021-01-01T00:00:00+01:00 == 2020-12-31T23:00:00Z == 1609455600000ms
        assertThat(isoToEpochMillisOrNull("2021-01-01T00:00:00+01:00")).isEqualTo(1_609_455_600_000L)
    }

    @Test
    fun `isoToEpochMillisOrNull parses the unix epoch as zero not absent`() {
        assertThat(isoToEpochMillisOrNull("1970-01-01T00:00:00Z")).isEqualTo(0L)
    }

    // MARK: - isoToEpochMillis (0L-defaulting variant still holds)

    @Test
    fun `isoToEpochMillis defaults absent and unparseable to zero`() {
        assertThat(isoToEpochMillis(null)).isEqualTo(0L)
        assertThat(isoToEpochMillis("garbage")).isEqualTo(0L)
    }

    @Test
    fun `isoToEpochMillis parses a valid instant`() {
        assertThat(isoToEpochMillis("1970-01-01T00:00:01Z")).isEqualTo(1_000L)
    }
}
