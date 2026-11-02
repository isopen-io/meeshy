package me.meeshy.ui.format

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import org.junit.Test

class BubbleClockLabelTest {

    private val paris = ZoneId.of("Europe/Paris")

    @Test
    fun `a bubble shows its hour and minute in the device zone`() {
        assertThat(bubbleClockLabel("2026-10-23T07:05:34.215Z", paris)).isEqualTo("09:05")
    }

    @Test
    fun `an afternoon hour is written on twenty four hours like iOS`() {
        assertThat(bubbleClockLabel("2026-01-10T14:30:00Z", paris)).isEqualTo("15:30")
    }

    @Test
    fun `an unreadable or missing date shows no clock`() {
        assertThat(bubbleClockLabel("hier", paris)).isNull()
        assertThat(bubbleClockLabel(null, paris)).isNull()
    }
}
