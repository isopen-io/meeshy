package me.meeshy.sdk.util

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WireDateFacadeTest {

    @Test
    fun `wireDate writes UTC with three digits of milliseconds`() {
        assertThat(wireDate(1_789_464_863_500L)).isEqualTo("2026-09-15T09:34:23.500Z")
        assertThat(wireDate(1_789_464_863_000L)).isEqualTo("2026-09-15T09:34:23.000Z")
    }

    @Test
    fun `what wireDate writes isoToEpochMillis reads back to the millisecond`() {
        val millis = 1_789_464_863_563L

        assertThat(isoToEpochMillis(wireDate(millis))).isEqualTo(millis)
    }

    @Test
    fun `isoToEpochMillis still reads a date-time without fractions`() {
        assertThat(isoToEpochMillis("2026-09-15T09:34:23Z")).isEqualTo(1_789_464_863_000L)
    }
}
