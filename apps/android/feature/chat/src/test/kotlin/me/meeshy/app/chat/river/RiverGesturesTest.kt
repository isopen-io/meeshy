package me.meeshy.app.chat.river

import androidx.compose.ui.geometry.Offset
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.river.RiverCursor
import me.meeshy.sdk.model.reading.river.RiverMetrics
import me.meeshy.sdk.model.reading.river.RiverStepDirection
import org.junit.Test

class RiverGesturesTest {

    private fun pane() = RiverPaneState()

    @Test
    fun `un pincement elargit les couloirs sans jamais depasser 540 dp`() {
        val pane = pane().also { it.pinchBegan() }
        pane.pinch(10f)
        assertThat(pane.laneWidthDp).isEqualTo(RiverMetrics.Lane.WIDTH_MAX.toFloat())
    }

    @Test
    fun `un pincement resserre les couloirs sans jamais descendre sous 210 dp`() {
        val pane = pane().also { it.pinchBegan() }
        pane.pinch(0.01f)
        assertThat(pane.laneWidthDp).isEqualTo(RiverMetrics.Lane.WIDTH_MIN.toFloat())
    }

    @Test
    fun `un second pincement repart de la largeur atteinte, pas de la reference`() {
        val pane = pane()
        pane.pinchBegan()
        pane.pinch(1.2f)
        val first = pane.laneWidthDp
        pane.pinchBegan()
        pane.pinch(1.1f)
        assertThat(pane.laneWidthDp).isWithin(0.01f).of(first * 1.1f)
    }

    @Test
    fun `le seuil de 40 dp est inclusif et la distance est celle du vecteur`() {
        assertThat(RiverSwipe.direction(Offset(0f, -40f), 40f, isRtl = false)).isEqualTo(RiverStepDirection.DOWN)
        assertThat(RiverSwipe.direction(Offset(0f, -39.9f), 40f, isRtl = false)).isNull()
        assertThat(RiverSwipe.direction(Offset(30f, 30f), 40f, isRtl = false)).isNotNull()
    }

    @Test
    fun `un saut vers un instant ancre le curseur sous la ligne de lecture, anime`() {
        val pane = pane()
        pane.landOn(RiverCursor(1, 4), animated = true)
        val request = pane.landing!!
        assertThat(request.anchor).isEqualTo(RiverAnchor.READING_LINE)
        assertThat(request.animated).isTrue()
        assertThat(pane.navigation.cursor).isEqualTo(RiverCursor(1, 4))
    }

    @Test
    fun `chaque demande de cadrage porte un jeton neuf et seule la plus recente se consomme`() {
        val pane = pane()
        pane.request(RiverCursor(0, 1), RiverAnchor.BOTTOM, animated = false)
        val old = pane.landing!!
        pane.request(RiverCursor(0, 2), RiverAnchor.BOTTOM, animated = false)
        pane.consume(old)
        assertThat(pane.landing).isNotNull()
        pane.consume(pane.landing!!)
        assertThat(pane.landing).isNull()
    }

    @Test
    fun `le glissement dure 0,35 s`() {
        assertThat(RiverPaneState.LANDING_MS).isEqualTo(350)
    }
}
