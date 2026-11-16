package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K42 — la loi de la fraction et la recette de la jauge : se lit, ne se règle pas. */
class MeeshyMeterTest {

    private fun resolve(
        form: MeeshyMeterForm = MeeshyMeterForm.Continuous,
        kind: MeeshyMeterKind = MeeshyMeterKind.Accent,
        fullKind: MeeshyMeterKind? = null,
        size: MeeshyMeterSize = MeeshyMeterSize.S8,
        fraction: Float = 0.5f,
        isStale: Boolean = false,
        isEnabled: Boolean = true,
        isRtl: Boolean = false,
        marks: List<Float> = emptyList(),
    ) = MeeshyMeterRecipe.resolve(form, kind, fullKind, size, fraction, isStale, isEnabled, isRtl, marks)

    @Test
    fun `la fraction est bornee a 0 et 1`() {
        assertThat(MeeshyMeterFraction.resolve(23.0, 50.0)).isWithin(1e-6f).of(0.46f)
        assertThat(MeeshyMeterFraction.resolve(-5.0, 50.0)).isEqualTo(0f)
        assertThat(MeeshyMeterFraction.resolve(80.0, 50.0)).isEqualTo(1f)
    }

    @Test
    fun `un total nul ou negatif ne rend rien`() {
        assertThat(MeeshyMeterFraction.resolve(3.0, 0.0)).isEqualTo(0f)
        assertThat(MeeshyMeterFraction.resolve(3.0, -2.0)).isEqualTo(0f)
        assertThat(MeeshyMeterFraction.isRendered(total = 0.0)).isFalse()
        assertThat(MeeshyMeterFraction.isRendered(total = 50.0)).isTrue()
        assertThat(MeeshyMeterFraction.resolve(Double.NaN, 10.0)).isEqualTo(0f)
    }

    @Test
    fun `trois pistes 5 8 12 et une largeur minimale egale a la hauteur des que la valeur depasse zero`() {
        assertThat(MeeshyMeterSize.entries.map { resolve(size = it).trackDp }).containsExactly(5, 8, 12).inOrder()
        assertThat(resolve(size = MeeshyMeterSize.S12, fraction = 0.01f).minFillDp).isEqualTo(12)
        assertThat(resolve(fraction = 0f).minFillDp).isEqualTo(0)
    }

    @Test
    fun `pleine, la jauge prend son genre de plein`() {
        assertThat(resolve(kind = MeeshyMeterKind.Accent, fullKind = MeeshyMeterKind.Err, fraction = 1f).kind).isEqualTo(MeeshyMeterKind.Err)
        assertThat(resolve(kind = MeeshyMeterKind.Accent, fullKind = MeeshyMeterKind.Err, fraction = 0.99f).kind).isEqualTo(MeeshyMeterKind.Accent)
        assertThat(resolve(kind = MeeshyMeterKind.Ok, fullKind = null, fraction = 1f).kind).isEqualTo(MeeshyMeterKind.Ok)
    }

    @Test
    fun `perimee, elle est desaturee ; eteinte, a 45 pour cent`() {
        assertThat(resolve(isStale = true).isDesaturated).isTrue()
        assertThat(resolve(isStale = true).opacity).isEqualTo(0.62f)
        assertThat(resolve(isEnabled = false).opacity).isEqualTo(0.45f)
        assertThat(resolve().opacity).isEqualTo(1f)
    }

    @Test
    fun `segmentee - N capsules egales de 12, ecart 6, les crans pleins suivent la fraction`() {
        val stepped = resolve(form = MeeshyMeterForm.Stepped(5), fraction = 0.46f)
        assertThat(stepped.segmentCount).isEqualTo(5)
        assertThat(stepped.trackDp).isEqualTo(12)
        assertThat(stepped.segmentGapDp).isEqualTo(6)
        assertThat(stepped.filledSegments).isEqualTo(2)
        assertThat(resolve(form = MeeshyMeterForm.Stepped(5), fraction = 1f).filledSegments).isEqualTo(5)
        assertThat(resolve(form = MeeshyMeterForm.Stepped(0), fraction = 1f).segmentCount).isEqualTo(1)
    }

    @Test
    fun `les reperes sont ignores en segmente, bornes et tries ailleurs`() {
        assertThat(resolve(form = MeeshyMeterForm.Stepped(4), marks = listOf(0.5f)).markOffsets).isEmpty()
        assertThat(resolve(marks = listOf(1.4f, 0.25f, -1f)).markOffsets).containsExactly(0f, 0.25f, 1f).inOrder()
    }

    @Test
    fun `le remplissage part du bord de debut, les reperes suivent le sens de lecture`() {
        assertThat(resolve(isRtl = false).fillsFromEnd).isFalse()
        assertThat(resolve(isRtl = true).fillsFromEnd).isTrue()
        assertThat(resolve(isRtl = true, marks = listOf(0.25f)).markOffsets).containsExactly(0.75f)
    }

    @Test
    fun `indeterminee - un passage de 1,8 s, sans fraction`() {
        val busy = resolve(form = MeeshyMeterForm.Indeterminate)
        assertThat(busy.isIndeterminate).isTrue()
        assertThat(MeeshyMeterRecipe.PASS_MILLIS).isEqualTo(1800)
        assertThat(busy.filledSegments).isEqualTo(0)
    }

    @Test
    fun `l'entree ne se joue que pour une valeur jamais vue, et jamais en mouvement reduit`() {
        assertThat(MeeshyMeterRecipe.entersAnimated(seenValue = null, value = 0.4f, reduceMotion = false)).isTrue()
        assertThat(MeeshyMeterRecipe.entersAnimated(seenValue = 0.4f, value = 0.4f, reduceMotion = false)).isFalse()
        assertThat(MeeshyMeterRecipe.entersAnimated(seenValue = null, value = 0.4f, reduceMotion = true)).isFalse()
    }

    @Test
    fun `la cascade d'une liste decale de 100 ms par rangee`() {
        assertThat(MeeshyMeterRecipe.entryDelayMillis(0)).isEqualTo(0)
        assertThat(MeeshyMeterRecipe.entryDelayMillis(3)).isEqualTo(300)
        assertThat(MeeshyMeterRecipe.entryDelayMillis(-1)).isEqualTo(0)
    }

    @Test
    fun `la voix dit la valeur vraie, a defaut le pourcentage`() {
        assertThat(MeeshyMeterRecipe.spokenValue("23 sur 50", fraction = 0.46f)).isEqualTo("23 sur 50")
        assertThat(MeeshyMeterRecipe.spokenValue(null, fraction = 0.46f)).isEqualTo("46%")
    }
}
