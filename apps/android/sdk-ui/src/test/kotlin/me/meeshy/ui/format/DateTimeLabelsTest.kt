package me.meeshy.ui.format

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class DateTimeLabelsTest {

    @Test
    fun `formats an ISO instant to a locale-aware short label in the viewer zone`() {
        val label = shortDateTimeLabel(
            iso = "2026-07-07T06:56:34.215Z",
            zone = ZoneId.of("Europe/Paris"),
            locale = Locale.FRANCE,
        )

        assertThat(label).contains("07/07/2026")
        assertThat(label).contains("08:56")
    }

    @Test
    fun `falls back to the raw value when the timestamp is not a parseable instant`() {
        assertThat(shortDateTimeLabel("not-a-date")).isEqualTo("not-a-date")
    }
}
