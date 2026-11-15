package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.Test

/** La liste ne tremble pas : hysteresis, marge de bascule et egalites (ports des temoins Jitter et Cadence iOS). */
class LentilleFocusElectionTest {

    private val pitch = LentilleFocusElection.ROW_HEIGHT + 6.0
    private val viewportTop = 120.0
    private val viewportBottom = 874.0
    private val ids = (0 until 20).map { "r$it" }

    private fun candidates(offsetFromTop: Double) = ids.mapIndexed { index, id ->
        FocalFocusCurve.RowCandidate(id, viewportTop + 200 + index * pitch + pitch / 2 - offsetFromTop)
    }

    private fun elect(offsetFromTop: Double, current: String?) = LentilleFocusElection.elect(
        candidates(offsetFromTop), viewportTop, viewportBottom, offsetFromTop, current,
    )

    private fun run(offsets: List<Double>, start: String?): List<String?> {
        var current = start
        return offsets.map { offset -> elect(offset, current).also { current = it } }
    }

    private fun changes(sequence: List<String?>) = sequence.zipWithNext().count { (a, b) -> a != b }

    private fun firstSwitch(from: Double, step: Double = 0.25): Pair<Double, String?> {
        var current = elect(from, null)
        var offset = from
        while (offset < from + 4 * pitch) {
            offset += step
            val next = elect(offset, current)
            if (next != current) return offset to current
            current = next
        }
        error("Aucune bascule sur quatre rangees : l election est gelee")
    }

    @Test
    fun `les constantes gelees de la liste et du fil sont respectees`() {
        assertThat(FocalFocusCurve.LIST_MAX_DISTANCE).isEqualTo(400.0)
        assertThat(FocalFocusCurve.LIST_ALPHA_DECAY).isEqualTo(0.45)
        assertThat(FocalFocusCurve.LIST_SCALE_DECAY).isEqualTo(0.10)
        assertThat(FocalFocusCurve.LIST_BELOW_BAND_DISTANCE).isEqualTo(160.0)
        assertThat(FocalFocusCurve.LIST_BELOW_BAND_ALPHA_CAP).isEqualTo(0.35)
        assertThat(FocalFocusCurve.THREAD_MAX_DISTANCE).isEqualTo(380.0)
        assertThat(FocalFocusCurve.THREAD_SCALE_DECAY).isEqualTo(0.40)
        assertThat(FocalFocusCurve.THREAD_ALPHA_DECAY).isEqualTo(0.82)
        assertThat(FocalScrollPerspective.ALPHA_FLOOR).isEqualTo(0.62)
        assertThat(FocalFocusCurve.THREAD_HORIZONTAL_PIVOT).isEqualTo(0.16)
        assertThat(FocalFocusCurve.THREAD_FOCUS_BAND_OFFSET).isEqualTo(150.0)
        assertThat(FocalFocusCurve.THREAD_FOCUS_BAND_HYSTERESIS).isEqualTo(95.0)
        assertThat(FocalFocusCurve.FOCUS_BAND_HALF_HEIGHT).isEqualTo(45.0)
        assertThat(LentilleFocusElection.SWITCH_MARGIN).isEqualTo(42.0)
    }

    @Test
    fun `un tremblement d un point a la frontiere ne fait pas basculer l elu loin du haut`() {
        val (boundary, before) = firstSwitch(420.0)
        val jitter = (0 until 24).map { boundary + if (it % 2 == 0) -1 else 1 }
        assertThat(changes(run(jitter, before))).isAtMost(1)
    }

    @Test
    fun `les allers-retours de la video dans la rampe du haut ne font pas basculer l elu`() {
        val (boundary, before) = firstSwitch(60.0)
        assertThat(boundary).isLessThan((viewportBottom - viewportTop) / 2)
        val measured = listOf(-3, -5, 0, 0, 4, -4, -5, 4, 0, 4, -3, -5, 0, -5, -5, 0, -3, 3, -4, 4, -3, -5)
        assertThat(changes(run(measured.map { boundary + it }, before))).isAtMost(1)
    }

    @Test
    fun `un defilement regulier elit chaque rangee a son tour sans retour en arriere`() {
        val offsets = generateSequence(420.0) { it + 2 }.takeWhile { it <= 420 + 5 * pitch }.toList()
        val distinct = run(offsets, null).filterNotNull().fold(emptyList<String>()) { acc, id ->
            if (acc.lastOrNull() == id) acc else acc + id
        }
        assertThat(distinct.size).isAtLeast(5)
        assertThat(distinct.toSet()).hasSize(distinct.size)
        val order = distinct.map(ids::indexOf)
        assertThat(order).isEqualTo(order.sorted())
    }

    @Test
    fun `l elu ne traine jamais plus d une demi-rangee derriere la plus proche`() {
        var current: String? = null
        var offset = 420.0
        while (offset <= 420 + 5 * pitch) {
            current = elect(offset, current)
            val focusY = LentilleFocusBand.centerY(viewportTop, viewportBottom, offset)
            val distances = candidates(offset).associate { it.id to kotlin.math.abs(it.midY - focusY) }
            val lag = distances.getValue(current!!) - distances.values.min()
            assertWithMessage("a $offset pt").that(lag).isAtMost(LentilleFocusElection.ROW_HEIGHT / 2)
            offset += 1.0
        }
    }

    @Test
    fun `le courant gagne a moins de la demi-bande et un challenger doit gagner une demi-rangee`() {
        val focus = 500.0
        val list = listOf(
            FocalFocusCurve.RowCandidate("a", focus - 40),
            FocalFocusCurve.RowCandidate("b", focus + 50),
        )
        assertThat(FocalFocusCurve.electFocusRow(list, focus, "b", 45.0)).isEqualTo("a")
        assertThat(LentilleFocusElection.holdingCurrent("a", "b", list, focus)).isEqualTo("b")
        val farther = list.map { if (it.id == "b") it.copy(midY = focus + 90) else it }
        assertThat(LentilleFocusElection.holdingCurrent("a", "b", farther, focus)).isEqualTo("a")
    }

    @Test
    fun `un courant sorti des candidats ou absent laisse la loi decider`() {
        val list = listOf(FocalFocusCurve.RowCandidate("a", 500.0))
        assertThat(LentilleFocusElection.holdingCurrent("a", "gone", list, 500.0)).isEqualTo("a")
        assertThat(LentilleFocusElection.holdingCurrent("a", null, list, 500.0)).isEqualTo("a")
        assertThat(LentilleFocusElection.holdingCurrent(null, "a", list, 500.0)).isNull()
    }

    @Test
    fun `les egalites de distance sont departagees par id et aucune bascule entre voisines au repos`() {
        val tied = listOf(FocalFocusCurve.RowCandidate("b", 450.0), FocalFocusCurve.RowCandidate("a", 550.0))
        assertThat(FocalFocusCurve.electFocusRow(tied, 500.0, null, 45.0)).isEqualTo("a")
        assertThat(FocalFocusCurve.electFocusRow(emptyList(), 500.0, null, 45.0)).isNull()
        val rest = List(30) { elect(420.0, "r5") }
        assertThat(rest.toSet()).hasSize(1)
    }

    @Test
    fun `la bande remonte au bord haut au repos et descend au centre sur une demi-hauteur`() {
        assertThat(LentilleFocusBand.centerY(100.0, 700.0, 0.0)).isEqualTo(100.0)
        assertThat(LentilleFocusBand.centerY(100.0, 700.0, 150.0)).isEqualTo(250.0)
        assertThat(LentilleFocusBand.centerY(100.0, 700.0, 9_999.0)).isEqualTo(400.0)
        assertThat(LentilleFocusBand.offsetFromTop(-120.0)).isEqualTo(120.0)
    }

    @Test
    fun `la perspective de liste fond vers l identite et reduire les animations la coupe`() {
        val full = LentillePerspective.pass(distance = 300.0, level = 1.0, reduceMotion = false)
        val law = FocalFocusCurve.focusCurve(300.0, FocalFocusCurve.Variant.LIST)
        assertThat(full).isEqualTo(law)
        assertThat(LentillePerspective.pass(300.0, 0.0, false)).isEqualTo(FocalFocusCurve.Result.IDENTITY)
        assertThat(LentillePerspective.pass(300.0, 1.0, true)).isEqualTo(FocalFocusCurve.Result.IDENTITY)
        assertThat(LentillePerspective.pass(-300.0, 1.0, false)).isEqualTo(law)
        assertThat(LentillePerspective.distance(100.0, 0.0, 800.0, 1_000.0)).isEqualTo(300.0)
    }
}
