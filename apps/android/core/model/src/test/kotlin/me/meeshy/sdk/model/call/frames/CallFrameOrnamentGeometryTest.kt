package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameOrnamentGeometryTest {

    private fun rect(x: Double, y: Double, w: Double, h: Double) = CallFrameRect(x, y, w, h)

    private val bounds = rect(0.0, 0.0, 200.0, 400.0)
    private val areas = CallFrameAreas(
        unit = 200.0,
        inner = rect(10.0, 10.0, 180.0, 380.0),
        top = rect(10.0, 10.0, 180.0, 40.0),
        content = rect(10.0, 50.0, 180.0, 300.0),
        bottom = rect(10.0, 350.0, 180.0, 40.0),
    )
    private val slot = CallFrameSlotBox(rect(30.0, 80.0, 140.0, 240.0), CallFrameSlotShape.RECT, 0.0, 0)

    private fun stage(front: Boolean, text: List<CallFrameRect> = emptyList()) =
        CallFrameOrnamentGeometry.stage(bounds, areas, listOf(slot), front, text)

    @Test
    fun `la graine ne depend que du rang`() {
        assertThat(CallFrameOrnamentGeometry.seed(0)).isEqualTo(1000.0)
        assertThat(CallFrameOrnamentGeometry.seed(3)).isEqualTo(1393.0)
    }

    @Test
    fun `un ornement du fond dispose de toute la toile`() {
        assertThat(CallFrameOrnamentGeometry.zones(bounds, areas, front = false)).containsExactly(bounds)
    }

    @Test
    fun `un ornement de premier plan ne dispose que des reserves et des marges`() {
        val zones = CallFrameOrnamentGeometry.zones(bounds, areas, front = true)
        assertThat(zones).contains(areas.top)
        assertThat(zones).contains(areas.bottom)
        assertThat(zones.none { CallFrameOrnamentGeometry.overlaps(it, slot.rect) && it != areas.top && it != areas.bottom }).isTrue()
    }

    @Test
    fun `deux tirages de la meme scene rendent les memes positions`() {
        val seed = CallFrameOrnamentGeometry.seed(2)
        val first = CallFrameOrnamentGeometry.spots(stage(front = false), seed, 20) { 4.0 }
        val second = CallFrameOrnamentGeometry.spots(stage(front = false), seed, 20) { 4.0 }
        assertThat(first).isEqualTo(second)
        assertThat(first).isNotEmpty()
    }

    @Test
    fun `deux rangs differents ne se posent pas aux memes endroits`() {
        val a = CallFrameOrnamentGeometry.spots(stage(front = false), CallFrameOrnamentGeometry.seed(0), 10) { 4.0 }
        val b = CallFrameOrnamentGeometry.spots(stage(front = false), CallFrameOrnamentGeometry.seed(1), 10) { 4.0 }
        assertThat(a).isNotEqualTo(b)
    }

    @Test
    fun `les positions restent dans la toile`() {
        CallFrameOrnamentGeometry.spots(stage(front = false), CallFrameOrnamentGeometry.seed(0), 60) { 4.0 }.forEach {
            assertThat(it.x).isIn(com.google.common.collect.Range.closed(0.0, 200.0))
            assertThat(it.y).isIn(com.google.common.collect.Range.closed(0.0, 400.0))
        }
    }

    @Test
    fun `au premier plan aucune position ne couvre une case`() {
        val spots = CallFrameOrnamentGeometry.spots(stage(front = true), CallFrameOrnamentGeometry.seed(1), 80) { 6.0 }
        assertThat(spots).isNotEmpty()
        spots.forEach {
            val around = rect(it.x - it.r, it.y - it.r, it.r * 2, it.r * 2)
            assertThat(CallFrameOrnamentGeometry.overlaps(around, slot.rect)).isFalse()
        }
    }

    @Test
    fun `aucune position ne se pose sur un texte de reserve`() {
        val text = listOf(rect(10.0, 10.0, 180.0, 30.0))
        val spots = CallFrameOrnamentGeometry.spots(stage(front = false, text = text), CallFrameOrnamentGeometry.seed(0), 80) { 5.0 }
        spots.forEach {
            assertThat(CallFrameOrnamentGeometry.overlaps(rect(it.x - it.r, it.y - it.r, it.r * 2, it.r * 2), text[0])).isFalse()
        }
    }

    @Test
    fun `une scene sans zone ne pose rien`() {
        val empty = stage(front = false).copy(zones = emptyList())
        assertThat(CallFrameOrnamentGeometry.spots(empty, 1000.0, 10) { 3.0 }).isEmpty()
    }

    @Test
    fun `des rectangles qui se touchent ne se coupent pas`() {
        assertThat(CallFrameOrnamentGeometry.overlaps(rect(0.0, 0.0, 10.0, 10.0), rect(10.0, 0.0, 10.0, 10.0))).isFalse()
        assertThat(CallFrameOrnamentGeometry.overlaps(rect(0.0, 0.0, 10.0, 10.0), rect(9.0, 9.0, 10.0, 10.0))).isTrue()
    }

    @Test
    fun `un ornement immobile ne bouge jamais`() {
        assertThat(CallFrameOrnamentMotionPlan.offset(CallFrameOrnamentMotion.STILL, 0, 3.0, 200.0, false)).isEqualTo(Pair(0.0, 0.0))
        assertThat(CallFrameOrnamentMotionPlan.animates(CallFrameOrnamentMotion.STILL, 3.0, false)).isFalse()
    }

    @Test
    fun `une boucle bouge avec le temps et se fige sous reduire les animations`() {
        val moving = CallFrameOrnamentMotionPlan.offset(CallFrameOrnamentMotion.LOOP, 1, 1.5, 200.0, false)
        val later = CallFrameOrnamentMotionPlan.offset(CallFrameOrnamentMotion.LOOP, 1, 2.5, 200.0, false)
        assertThat(moving).isNotEqualTo(later)
        assertThat(CallFrameOrnamentMotionPlan.offset(CallFrameOrnamentMotion.LOOP, 1, 1.5, 200.0, true)).isEqualTo(Pair(0.0, 0.0))
        assertThat(CallFrameOrnamentMotionPlan.animates(CallFrameOrnamentMotion.LOOP, 1.5, true)).isFalse()
        assertThat(CallFrameOrnamentMotionPlan.animates(CallFrameOrnamentMotion.LOOP, 1.5, false)).isTrue()
    }

    @Test
    fun `l entree en fondu est complete apres sa duree et jamais appliquee sous reduire les animations`() {
        assertThat(CallFrameOrnamentMotionPlan.alpha(CallFrameOrnamentMotion.ON_APPEAR, 0.3, false)).isWithin(1e-9).of(0.5)
        assertThat(CallFrameOrnamentMotionPlan.alpha(CallFrameOrnamentMotion.ON_APPEAR, 5.0, false)).isEqualTo(1.0)
        assertThat(CallFrameOrnamentMotionPlan.alpha(CallFrameOrnamentMotion.ON_APPEAR, 0.0, true)).isEqualTo(1.0)
        assertThat(CallFrameOrnamentMotionPlan.animates(CallFrameOrnamentMotion.ON_APPEAR, 5.0, false)).isFalse()
    }
}
