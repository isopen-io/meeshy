package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.chat.PinnedDayHeader.Row
import org.junit.Test

/** Port des cas d'iOS `MessageDayStickyLawTests` : jamais deux pastilles de date à l'écran. */
class PinnedDayStickyLawTest {

    private fun message(minY: Float, maxY: Float) = Row(isDayHeader = false, minY = minY, maxY = maxY)
    private fun day(minY: Float, maxY: Float) = Row(isDayHeader = true, minY = minY, maxY = maxY)

    @Test
    fun `names the topmost row whose bottom crosses the reading line`() {
        val rows = listOf(message(-120f, 40f), message(40f, 300f), message(300f, 900f))
        assertThat(PinnedDayHeader.stickyRow(rows, readingLine = 200f, viewportBottom = 1000f)).isEqualTo(1)
    }

    @Test
    fun `a row already gone under the header no longer counts as the top`() {
        val rows = listOf(message(-300f, 150f), message(150f, 600f))
        assertThat(PinnedDayHeader.stickyRow(rows, readingLine = 200f, viewportBottom = 1000f)).isEqualTo(1)
    }

    @Test
    fun `stays silent while a section pill is visible below the reading line`() {
        // Le cas des deux pastilles empilées : « Mercredi » flottant au-dessus de la section « Jeudi ».
        val rows = listOf(message(100f, 260f), day(260f, 320f), message(320f, 900f))
        assertThat(PinnedDayHeader.stickyRow(rows, readingLine = 200f, viewportBottom = 1000f)).isNull()
    }

    @Test
    fun `a section pill under the transparent composer still silences the floating one`() {
        val rows = listOf(message(0f, 900f), day(950f, 1010f))
        assertThat(PinnedDayHeader.stickyRow(rows, readingLine = 200f, viewportBottom = 1100f)).isNull()
    }

    @Test
    fun `a section pill already scrolled above the reading line does not silence it`() {
        val rows = listOf(day(100f, 160f), message(160f, 900f))
        assertThat(PinnedDayHeader.stickyRow(rows, readingLine = 200f, viewportBottom = 1000f)).isEqualTo(1)
    }

    @Test
    fun `rows below the viewport are ignored and an empty screen names nothing`() {
        assertThat(PinnedDayHeader.stickyRow(emptyList(), 200f, 1000f)).isNull()
        val rows = listOf(message(250f, 900f), day(1000f, 1060f))
        assertThat(PinnedDayHeader.stickyRow(rows, readingLine = 200f, viewportBottom = 1000f)).isEqualTo(0)
    }
}
