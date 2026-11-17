package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K34 — les chiffres : taille, bande, mini-courbe bornée dans son cadre, positions qui roulent, phrase dite. */
class MeeshyFiguresTest {

    private fun resolve(
        size: MeeshyFigureSize = MeeshyFigureSize.Large,
        count: Int = 1,
        width: Double = 390.0,
        isLoading: Boolean = false,
        isEmpty: Boolean = false,
        isStacked: Boolean = false,
        hasValue: Boolean = false,
    ) = MeeshyFiguresRecipe.resolve(size, count, width, isLoading, isEmpty, isStacked, hasValue)

    @Test
    fun `les polices sont 48 34 et 24`() {
        assertThat(MeeshyFigureSize.entries.map { MeeshyFiguresRecipe.fontSize(it) }).containsExactly(48.0, 34.0, 24.0).inOrder()
    }

    @Test
    fun `une bande de n chiffres a n moins un filets et le compte est borne de 1 a 4`() {
        assertThat(resolve(count = 3).separatorCount).isEqualTo(2)
        assertThat(resolve(count = 0).separatorCount).isEqualTo(0)
        assertThat(resolve(count = 9).separatorCount).isEqualTo(3)
        assertThat(resolve(count = 3, isStacked = true).separatorsAreHorizontal).isTrue()
    }

    @Test
    fun `quatre chiffres sous 360 passent en compact`() {
        assertThat(resolve(count = 4, width = 340.0).size).isEqualTo(MeeshyFigureSize.Compact)
        assertThat(resolve(count = 4, width = 390.0).size).isEqualTo(MeeshyFigureSize.Large)
        assertThat(resolve(count = 3, width = 340.0).size).isEqualTo(MeeshyFigureSize.Large)
    }

    @Test
    fun `le squelette n apparait qu au premier chargement sans valeur`() {
        assertThat(resolve(isLoading = true).showsSkeleton).isTrue()
        assertThat(resolve(isLoading = true, hasValue = true).showsSkeleton).isFalse()
        assertThat(resolve().showsSkeleton).isFalse()
    }

    @Test
    fun `la mini courbe a deux points au moins et reste dans son cadre`() {
        assertThat(MeeshyFiguresRecipe.sparkPoints(listOf(1.0), 72.0, 28.0)).isEmpty()
        val points = MeeshyFiguresRecipe.sparkPoints(listOf(0.0, 10.0, 5.0), 72.0, 28.0)
        assertThat(points.map { it.x }).containsExactly(0.0, 36.0, 72.0).inOrder()
        assertThat(points[0].y).isEqualTo(25.0)
        assertThat(points[1].y).isEqualTo(3.0)
        points.forEach {
            assertThat(it.y).isAtLeast(3.0)
            assertThat(it.y).isAtMost(25.0)
        }
    }

    @Test
    fun `une serie constante se pose au milieu et un non nombre vaut le minimum`() {
        val flat = MeeshyFiguresRecipe.sparkPoints(listOf(4.0, 4.0, 4.0), 72.0, 28.0)
        assertThat(flat.map { it.y }.toSet()).containsExactly(14.0)
        val gap = MeeshyFiguresRecipe.sparkPoints(listOf(0.0, Double.NaN, 10.0), 72.0, 28.0)
        assertThat(gap[1].y).isEqualTo(gap[0].y)
    }

    @Test
    fun `la jauge d une part est bornee et une part qui existe ne descend pas sous 4`() {
        assertThat(MeeshyFiguresRecipe.shareFill(0.5, 100.0)).isEqualTo(50.0)
        assertThat(MeeshyFiguresRecipe.shareFill(0.001, 100.0)).isEqualTo(4.0)
        assertThat(MeeshyFiguresRecipe.shareFill(3.0, 100.0)).isEqualTo(100.0)
        assertThat(MeeshyFiguresRecipe.shareFill(0.0, 100.0)).isEqualTo(0.0)
        assertThat(MeeshyFiguresRecipe.shareFill(Double.NaN, 100.0)).isEqualTo(0.0)
        assertThat(MeeshyFiguresRecipe.shareFill(0.5, 2.0)).isEqualTo(2.0)
    }

    @Test
    fun `au plus quatre rangees de part sont visibles`() {
        assertThat(MeeshyFiguresRecipe.visibleShareRows(9)).isEqualTo(4)
        assertThat(MeeshyFiguresRecipe.visibleShareRows(-1)).isEqualTo(0)
    }

    @Test
    fun `seuls les chiffres qui different roulent alignes par la fin`() {
        assertThat(MeeshyFiguresRecipe.changedPositions("1 249", "1 250")).containsExactly(3, 4).inOrder()
        assertThat(MeeshyFiguresRecipe.changedPositions("99", "100")).containsExactly(0, 1, 2).inOrder()
        assertThat(MeeshyFiguresRecipe.changedPositions("12", "12")).isEmpty()
        assertThat(MeeshyFiguresRecipe.changedPositions(null, "12")).isEmpty()
        assertThat(MeeshyFiguresRecipe.changedPositions("1,5", "2,5")).containsExactly(0)
    }

    @Test
    fun `une valeur absente se lit par un tiret et la phrase dite met la valeur puis l unite`() {
        assertThat(MeeshyFiguresRecipe.displayedValue(null)).isEqualTo("—")
        assertThat(MeeshyFiguresRecipe.displayedValue("")).isEqualTo("—")
        assertThat(MeeshyFiguresRecipe.displayedValue("12")).isEqualTo("12")
        assertThat(MeeshyFiguresRecipe.spoken("12", "amis", "inconnu")).isEqualTo("12 amis")
        assertThat(MeeshyFiguresRecipe.spoken(null, "amis", "inconnu")).isEqualTo("inconnu amis")
        assertThat(MeeshyFiguresRecipe.spokenBand(listOf("12 amis", "3 groupes"))).isEqualTo("12 amis, 3 groupes")
    }

    @Test
    fun `la tendance dit un sens par sa fleche et pas seulement par la couleur`() {
        assertThat(MeeshyFigureTrend.Up("+4").arrow).isEqualTo(MeeshyFigureTrendArrow.UpRight)
        assertThat(MeeshyFigureTrend.Down("-2").arrow).isEqualTo(MeeshyFigureTrendArrow.DownRight)
        assertThat(MeeshyFigureTrend.Flat("0").arrow).isEqualTo(MeeshyFigureTrendArrow.Right)
        assertThat(MeeshyFigureTrend.Up("+4").text).isEqualTo("+4")
    }
}
