package me.meeshy.sdk.model.reading.focal

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective.CellGeometry
import org.junit.Test

class FocalScrollPerspectiveTest {

    private fun cell(id: String, midY: Double, height: Double = 100.0, isMessage: Boolean = true) =
        CellGeometry(id = id, visualMidY = midY, height = height, isMessage = isMessage)

    private fun byId(cells: List<CellGeometry>, focusY: Double) =
        FocalScrollPerspective.poses(cells, focusY, reduceMotion = false).associateBy { it.id }

    @Test
    fun `la pose sur la ligne de focus est l identite et symetrique des deux cotes`() {
        assertThat(FocalScrollPerspective.pose(0.0, false)).isEqualTo(FocalScrollPerspective.Pose.IDENTITY)
        assertThat(FocalScrollPerspective.pose(-120.0, false)).isEqualTo(FocalScrollPerspective.pose(120.0, false))
    }

    @Test
    fun `la pose pres de la ligne suit la courbe du fil sans toucher au plancher`() {
        val pose = FocalScrollPerspective.pose(100.0, false)
        val law = FocalFocusCurve.focusCurve(100.0, FocalFocusCurve.Variant.THREAD)
        assertThat(pose.scale).isWithin(1e-4).of(law.scale)
        assertThat(pose.alpha).isWithin(1e-4).of(law.alpha)
        assertThat(pose.scale).isLessThan(1.0)
    }

    @Test
    fun `une rangee lointaine plafonne a l echelle de la loi et au plancher d opacite`() {
        val pose = FocalScrollPerspective.pose(5_000.0, false)
        assertThat(pose.scale).isWithin(1e-4).of(1 - FocalFocusCurve.THREAD_SCALE_DECAY)
        assertThat(pose.alpha).isWithin(1e-4).of(FocalScrollPerspective.ALPHA_FLOOR)
        assertThat(FocalScrollPerspective.ALPHA_FLOOR).isGreaterThan(1 - FocalFocusCurve.THREAD_ALPHA_DECAY)
    }

    @Test
    fun `reduire les animations donne la pose identite quelle que soit la distance`() {
        assertThat(FocalScrollPerspective.pose(400.0, true)).isEqualTo(FocalScrollPerspective.Pose.IDENTITY)
        val poses = FocalScrollPerspective.poses(listOf(cell("a", 100.0), cell("b", 500.0)), 700.0, reduceMotion = true)
        assertThat(poses.all { it.scale == 1.0 && it.alpha == 1.0 && it.pull == 0.0 }).isTrue()
    }

    @Test
    fun `la ligne de focus est au centre apres une demi-hauteur et au bord bas au repos`() {
        assertThat(FocalScrollPerspective.focusY(100.0, 700.0, 300.0)).isEqualTo(400.0)
        assertThat(FocalScrollPerspective.focusY(100.0, 700.0, 5_000.0)).isEqualTo(400.0)
        assertThat(FocalScrollPerspective.focusY(100.0, 700.0, 0.0)).isEqualTo(700.0)
        assertThat(FocalScrollPerspective.focusY(100.0, 700.0, 150.0)).isEqualTo(550.0)
        assertThat(FocalScrollPerspective.focusY(100.0, 700.0, -40.0)).isEqualTo(700.0)
    }

    @Test
    fun `la compaction tire chaque rangee du dessus de la hauteur perdue par celles qui la separent de la ligne`() {
        val poses = byId(listOf(cell("below", 760.0), cell("a", 550.0), cell("b", 450.0), cell("c", 350.0)), 700.0)
        assertThat(poses.getValue("below").pull).isEqualTo(0.0)
        assertThat(poses.getValue("below").anchorY).isEqualTo(1.0)
        assertThat(poses.getValue("a").pull).isEqualTo(0.0)
        assertThat(poses.getValue("a").anchorY).isEqualTo(0.0)
        val lostA = (1 - poses.getValue("a").scale) * 100
        assertThat(poses.getValue("b").pull).isWithin(1e-4).of(lostA)
        val lostB = (1 - poses.getValue("b").scale) * 100
        assertThat(poses.getValue("c").pull).isWithin(1e-4).of(lostA + lostB)
        assertThat(poses.getValue("c").scale).isLessThan(poses.getValue("b").scale)
    }

    @Test
    fun `la compaction tire les rangees du dessous vers le haut avec un pull negatif`() {
        val poses = byId(listOf(cell("above", 240.0), cell("a", 450.0), cell("b", 550.0), cell("c", 650.0)), 300.0)
        assertThat(poses.getValue("a").pull).isEqualTo(0.0)
        assertThat(poses.getValue("a").anchorY).isEqualTo(1.0)
        val lostA = (1 - poses.getValue("a").scale) * 100
        assertThat(poses.getValue("b").pull).isWithin(1e-4).of(-lostA)
        val lostB = (1 - poses.getValue("b").scale) * 100
        assertThat(poses.getValue("c").pull).isWithin(1e-4).of(-(lostA + lostB))
        assertThat(poses.getValue("above").anchorY).isEqualTo(0.0)
    }

    @Test
    fun `une pilule s estompe sans changer d echelle et ne libere aucune hauteur`() {
        val poses = byId(listOf(cell("pill", 300.0, height = 40.0, isMessage = false), cell("m", 100.0)), 700.0)
        assertThat(poses.getValue("pill").scale).isEqualTo(1.0)
        assertThat(poses.getValue("pill").alpha).isLessThan(1.0)
        assertThat(poses.getValue("m").pull).isEqualTo(0.0)
    }

    @Test
    fun `le message en focus est le plus proche avec l hysteresis du fil`() {
        val near = listOf(cell("near", 690.0), cell("far", 400.0), cell("pill", 705.0, isMessage = false))
        assertThat(FocalScrollPerspective.focusedId(near, 700.0, null)).isEqualTo("near")
        val hysteresis = FocalFocusCurve.THREAD_FOCUS_BAND_HYSTERESIS
        val drifted = listOf(cell("near", 700 - hysteresis + 1), cell("other", 702.0))
        assertThat(FocalScrollPerspective.focusedId(drifted, 700.0, "near")).isEqualTo("near")
        val gone = listOf(cell("near", 700 - hysteresis - 1), cell("other", 702.0))
        assertThat(FocalScrollPerspective.focusedId(gone, 700.0, "near")).isEqualTo("other")
    }

    @Test
    fun `a egalite de distance le plus petit id est elu`() {
        val tied = listOf(cell("b", 650.0), cell("a", 750.0))
        assertThat(FocalScrollPerspective.focusedId(tied, 700.0, null)).isEqualTo("a")
    }

    @Test
    fun `la carte laisse la meme marge visible en haut et en bas`() {
        val head = FocalScrollPerspective.focusCardInsets(isFirstInGroup = true)
        val follow = FocalScrollPerspective.focusCardInsets(isFirstInGroup = false)
        val margin = FocalScrollPerspective.FOCUS_CARD_INNER_MARGIN
        assertThat(head.top).isEqualTo(FocalMetrics.Row.PADDING_VERTICAL + FocalMetrics.Row.GROUP_TOP_PADDING - margin)
        assertThat(head.bottom).isEqualTo(FocalMetrics.Row.PADDING_VERTICAL - margin)
        assertThat(follow.bottom).isEqualTo(follow.top)
        assertThat(head.left).isEqualTo(FocalScrollPerspective.FOCUS_CARD_HORIZONTAL_INSET)
        assertThat(follow.top).isAtLeast(0.0)
    }

    @Test
    fun `la loupe du deplie grandit le seul message en focus et ne deborde pas de sa marge`() {
        assertThat(FocalScrollPerspective.loupeScale(true, false, 390.0, 60.0))
            .isWithin(1e-4).of(1 + FocalMetrics.Focus.EXPANDED_LOUPE_GAIN)
        assertThat(FocalScrollPerspective.loupeScale(false, false, 390.0, 60.0)).isEqualTo(1.0)
        assertThat(FocalScrollPerspective.loupeScale(true, true, 390.0, 60.0)).isEqualTo(1.0)
        val tall = FocalScrollPerspective.loupeScale(true, false, 390.0, 900.0)
        assertThat(tall).isGreaterThan(1.0)
        assertThat((tall - 1) * 900.0 / 2).isAtMost(FocalMetrics.FocusCard.MARGIN_VERTICAL + 1e-4)
    }
}
