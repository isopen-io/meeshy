package me.meeshy.app.chat.river

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RiverFramingTest {

    @Test
    fun `le cadre d'une bulle est son couloir, sous sa couture, dans le repere du volet`() {
        val frame = RiverFraming.bubbleFrame(
            row = RiverRowExtent(rank = 3, top = 100f, height = 90f),
            laneIndex = 2,
            laneWidthPx = 300f,
            gutterPx = 28f,
            seamPx = 14f,
            horizontalScrollPx = 150f,
        )
        assertThat(frame.left).isEqualTo(2 * 300f + 28f - 150f)
        assertThat(frame.top).isEqualTo(114f)
        assertThat(frame.width).isEqualTo(300f - 56f)
        assertThat(frame.bottom).isEqualTo(190f)
    }

    @Test
    fun `la hauteur de lecture nomme la rangee dont le milieu est le plus proche de la ligne, la premiere a egalite`() {
        val rows = listOf(
            RiverRowExtent(4, 0f, 100f),
            RiverRowExtent(5, 100f, 100f),
            RiverRowExtent(6, 200f, 100f),
        )
        assertThat(RiverFraming.focusRank(rows, readingLine = 160f, fallbackRank = 0)).isEqualTo(5)
        assertThat(RiverFraming.focusRank(rows, readingLine = 100f, fallbackRank = 0)).isEqualTo(4)
    }

    @Test
    fun `sans rangee mesuree le curseur reprend son role`() {
        assertThat(RiverFraming.focusRank(emptyList(), readingLine = 100f, fallbackRank = 7)).isEqualTo(7)
    }

    @Test
    fun `la ligne de lecture est un tiers sous le haut de la surface lue, sous l'en-tete`() {
        assertThat(RiverFraming.readingLine(paneHeightPx = 1000f, headerInsetPx = 100f)).isEqualTo(100f + 900f * 0.34f)
    }
}

class RiverPaneStateLawTest {
    private val metrics = RiverPaneMetrics(400f, 1000f, 100f, 80f, 100f, 28f, 14f)

    @Test
    fun `l'ancre basse pose la base de la cellule sur le haut du composeur`() {
        val delta = RiverPaneState.verticalDelta(RiverAnchor.BOTTOM, top = 900f, size = 100f, metrics = metrics)
        assertThat(900f - delta + 100f).isEqualTo(1000f - 80f)
    }

    @Test
    fun `l'ancre de lecture pose le tiers de la cellule sur la ligne de lecture`() {
        val delta = RiverPaneState.verticalDelta(RiverAnchor.READING_LINE, top = 700f, size = 100f, metrics = metrics)
        assertThat(700f - delta + 0.34f * 100f).isWithin(0.01f).of(RiverFraming.readingLine(1000f, 100f))
    }
}
