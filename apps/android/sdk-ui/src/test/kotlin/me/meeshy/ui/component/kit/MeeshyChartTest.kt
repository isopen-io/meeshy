package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K50 — le graphique : une teinte, un pic, deux bornes ; les mesures pures se testent ici. */
class MeeshyChartTest {

    @Test
    fun `la hauteur suit le genre et la taille`() {
        fun h(kind: MeeshyChartKind, size: MeeshyChartSize = MeeshyChartSize.Regular, n: Int = 4) =
            MeeshyChartRecipe.resolve(kind, size, pointCount = n).heightDp
        assertThat(h(MeeshyChartKind.Bars, MeeshyChartSize.Compact)).isEqualTo(96f)
        assertThat(h(MeeshyChartKind.Line)).isEqualTo(128f)
        assertThat(h(MeeshyChartKind.Bars, MeeshyChartSize.Large)).isEqualTo(220f)
        assertThat(h(MeeshyChartKind.Strip)).isEqualTo(26f)
        assertThat(h(MeeshyChartKind.Funnel, n = 3)).isEqualTo(156f)
        assertThat(h(MeeshyChartKind.Donut)).isEqualTo(104f)
        assertThat(h(MeeshyChartKind.Breakdown)).isEqualTo(0f)
    }

    @Test
    fun `le donut garde sa piste et replie au dela de cinq parts`() {
        val six = MeeshyChartRecipe.resolve(MeeshyChartKind.Donut, pointCount = 6)
        assertThat(six.keepsTrack).isTrue()
        assertThat(six.foldsOthers).isTrue()
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Donut, pointCount = 5).foldsOthers).isFalse()
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Bars, pointCount = 9).foldsOthers).isFalse()
    }

    @Test
    fun `un axe pour barres, courbe et bande - sans point le graphique est vide`() {
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Bars, pointCount = 3).hasAxis).isTrue()
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Donut, pointCount = 3).hasAxis).isFalse()
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Line, pointCount = 0).isEmpty).isTrue()
    }

    @Test
    fun `l ecart des barres s elargit en grand et la barre de ventilation suit la disposition`() {
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Bars, MeeshyChartSize.Large, pointCount = 3).barGapDp).isEqualTo(6f)
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Bars, pointCount = 3).barGapDp).isEqualTo(3f)
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Breakdown, pointCount = 3, layout = MeeshyChartLayout.Inline).breakdownBarDp).isEqualTo(10f)
        assertThat(MeeshyChartRecipe.resolve(MeeshyChartKind.Breakdown, pointCount = 3).breakdownBarDp).isEqualTo(8f)
    }

    @Test
    fun `la bande porte la valeur par l opacite de 12 a 100 pour cent`() {
        assertThat(MeeshyChartRecipe.stripLevel(0f)).isEqualTo(0.12f)
        assertThat(MeeshyChartRecipe.stripLevel(1f)).isEqualTo(1f)
        assertThat(MeeshyChartRecipe.stripLevel(5f)).isEqualTo(1f)
        assertThat(MeeshyChartRecipe.stripLevel(-1f)).isEqualTo(0.12f)
    }

    @Test
    fun `la bulle a une aire proportionnelle a la valeur, de 34 a 78`() {
        assertThat(MeeshyChartRecipe.bubbleDiameter(0f)).isEqualTo(34)
        assertThat(MeeshyChartRecipe.bubbleDiameter(1f)).isEqualTo(78)
        assertThat(MeeshyChartRecipe.bubbleDiameter(0.5f)).isEqualTo(60)
    }

    @Test
    fun `normaliser - illisible ou negatif vaut zero, une serie nulle reste nulle`() {
        assertThat(MeeshyChartScale.normalized(listOf(2.0, 4.0, -1.0, Double.NaN))).containsExactly(0.5f, 1f, 0f, 0f).inOrder()
        assertThat(MeeshyChartScale.normalized(listOf(0.0, 0.0))).containsExactly(0f, 0f).inOrder()
        assertThat(MeeshyChartScale.normalized(listOf(5.0, 10.0), ceiling = 20.0)).containsExactly(0.25f, 0.5f).inOrder()
    }

    @Test
    fun `graduations rondes dont la derniere couvre le maximum`() {
        assertThat(MeeshyChartScale.niceTicks(100.0, 4)).containsExactly(0.0, 50.0, 100.0).inOrder()
        assertThat(MeeshyChartScale.niceTicks(37.0, 4)).containsExactly(0.0, 10.0, 20.0, 30.0, 40.0).inOrder()
        assertThat(MeeshyChartScale.niceTicks(0.0, 4)).containsExactly(0.0, 1.0).inOrder()
        assertThat(MeeshyChartScale.niceTicks(Double.NaN, 4)).containsExactly(0.0, 1.0).inOrder()
    }

    @Test
    fun `le pic est le premier plus haut point`() {
        assertThat(MeeshyChartScale.peak(listOf(3.0, 9.0, 9.0, 1.0))).isEqualTo(MeeshyChartPeak(1, 9.0))
        assertThat(MeeshyChartScale.peak(emptyList())).isNull()
    }

    @Test
    fun `les parts se suivent bout a bout, un total nul n a pas de largeur`() {
        val s = MeeshyChartScale.segments(listOf(1.0, 3.0))
        assertThat(s.map { it.start }).containsExactly(0f, 0.25f).inOrder()
        assertThat(s.map { it.end }).containsExactly(0.25f, 1f).inOrder()
        assertThat(MeeshyChartScale.segments(listOf(0.0, 0.0)).map { it.share }).containsExactly(0f, 0f)
    }

    @Test
    fun `l arc est en fractions de tour, le tour complet est marque`() {
        val quarter = MeeshyChartScale.arc(0f, 0.25f, radius = 52f, thickness = 12f)
        assertThat(quarter.startDegrees).isEqualTo(0f)
        assertThat(quarter.sweepDegrees).isEqualTo(90f)
        assertThat(quarter.innerRadius).isEqualTo(40f)
        assertThat(quarter.isFullTurn).isFalse()
        assertThat(MeeshyChartScale.arc(0f, 1f, 52f, 12f).isFullTurn).isTrue()
    }

    @Test
    fun `plus de cinq categories se replient en Autres`() {
        val items = (1..7).map { MeeshyChartDatum("k$it", "L$it", it.toDouble()) }
        val folded = MeeshyChartScale.foldIntoOthers(items, limit = 5, othersLabel = "Autres")
        assertThat(folded).hasSize(6)
        assertThat(folded.last()).isEqualTo(MeeshyChartDatum("others", "Autres", 13.0))
        assertThat(MeeshyChartScale.foldIntoOthers(items.take(5), 5, "Autres")).hasSize(5)
    }
}
