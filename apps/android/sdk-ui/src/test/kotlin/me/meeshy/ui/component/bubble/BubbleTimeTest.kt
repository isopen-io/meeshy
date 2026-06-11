package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale

class BubbleTimeTest {

    @Test
    fun `formats the local time of the message`() {
        val formatted = formatBubbleTime("2026-06-10T14:32:00Z", ZoneOffset.UTC, Locale.FRANCE)

        assertThat(formatted).isEqualTo("14:32")
    }

    @Test
    fun `respects the device zone`() {
        val paris = ZoneId.of("Europe/Paris")

        val formatted = formatBubbleTime("2026-06-10T22:30:00Z", paris, Locale.FRANCE)

        assertThat(formatted).isEqualTo("00:30")
    }

    @Test
    fun `absent or unparseable timestamps yield nothing`() {
        assertThat(formatBubbleTime(null, ZoneOffset.UTC, Locale.FRANCE)).isNull()
        assertThat(formatBubbleTime("not-a-date", ZoneOffset.UTC, Locale.FRANCE)).isNull()
    }
}
