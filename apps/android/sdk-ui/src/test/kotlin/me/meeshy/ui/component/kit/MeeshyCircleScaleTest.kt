package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

/** K33 — la loi d'intensité, les rangs bornés et les mesures des trois formes. */
class MeeshyCircleScaleTest {

    private fun intensities(count: Int) = (0 until count).map { MeeshyCircleScaleRecipe.intensity(it, count) }

    private fun resolve(
        count: Int = 6,
        current: Int? = 2,
        other: Int? = null,
        form: MeeshyCircleScaleForm = MeeshyCircleScaleForm.Pill,
        size: MeeshyCircleScaleSize = MeeshyCircleScaleSize.Regular,
        isPressed: Boolean = false,
        isEnabled: Boolean = true,
    ) = MeeshyCircleScaleRecipe.resolve(count, current, other, form, size, isPressed, isEnabled)

    @Test
    fun `la loi d'intensite se compte depuis le haut - le meme nom a la meme intensite`() {
        assertThat(intensities(6)).containsExactly(0f, 0.08f, 0.18f, 0.32f, 0.52f, 1f).inOrder()
        assertThat(intensities(5)).containsExactly(0.08f, 0.18f, 0.32f, 0.52f, 1f).inOrder()
        assertThat(intensities(8).takeLast(5)).containsExactly(0.08f, 0.18f, 0.32f, 0.52f, 1f).inOrder()
    }

    @Test
    fun `trois niveaux ou moins sautent un cran sur deux pour garder l'ecart`() {
        assertThat(intensities(3)).containsExactly(0.08f, 0.32f, 1f).inOrder()
        assertThat(intensities(2)).containsExactly(0.32f, 1f).inOrder()
    }

    @Test
    fun `un rang hors bornes est ramene et sans rang rien ne s'allume`() {
        assertThat(MeeshyCircleScaleRecipe.clamped(-3, 6)).isEqualTo(0)
        assertThat(MeeshyCircleScaleRecipe.clamped(99, 6)).isEqualTo(5)
        assertThat(MeeshyCircleScaleRecipe.clamped(2, 6)).isEqualTo(2)
        assertThat(MeeshyCircleScaleRecipe.clamped(null, 6)).isNull()
        assertThat(resolve(current = null).litLevel).isNull()
    }

    @Test
    fun `de deux a huit niveaux seulement`() {
        assertThat(resolve(count = 1).isRendered).isFalse()
        assertThat(resolve(count = 9).isRendered).isFalse()
        assertThat((2..8).all { resolve(count = it).isRendered }).isTrue()
    }

    @Test
    fun `la pilule a trois hauteurs 26 34 44`() {
        assertThat(MeeshyCircleScaleSize.entries.map { resolve(size = it).pillHeightDp }).containsExactly(26f, 34f, 44f).inOrder()
    }

    @Test
    fun `les mesures de la fiche - pastille 58 cran 12 anneaux 1,5 et 4 lueur 26 centre 40 repere 48`() {
        val v = resolve()
        assertThat(v.dotDiameterDp).isEqualTo(58f)
        assertThat(v.stepHeightDp).isEqualTo(12f)
        assertThat(v.stepGapDp).isEqualTo(6f)
        assertThat(v.ringStrokeDp).isEqualTo(1.5f)
        assertThat(v.litRingStrokeDp).isEqualTo(4f)
        assertThat(v.ringGapDp).isEqualTo(20f)
        assertThat(v.glowRadiusDp).isEqualTo(26f)
        assertThat(v.centerDiameterDp).isEqualTo(40f)
        assertThat(v.markerDiameterDp).isEqualTo(48f)
    }

    @Test
    fun `presse 0,92 desactive 40 pour cent`() {
        assertThat(resolve(isPressed = true).pressedScale).isEqualTo(0.92f)
        assertThat(resolve().pressedScale).isEqualTo(1f)
        assertThat(resolve(isEnabled = false).opacity).isEqualTo(0.4f)
        assertThat(resolve().opacity).isEqualTo(1f)
    }

    @Test
    fun `la pilule ignore le second niveau`() {
        assertThat(resolve(form = MeeshyCircleScaleForm.Pill, other = 4).otherLevel).isNull()
        assertThat(resolve(form = MeeshyCircleScaleForm.Rings, other = 99).otherLevel).isEqualTo(5)
    }

    @Test
    fun `l'encre se choisit a l'intensite du fond - sombre des 52 pour cent`() {
        assertThat(MeeshyCircleScaleRecipe.usesDarkInk(1f)).isTrue()
        assertThat(MeeshyCircleScaleRecipe.usesDarkInk(0.52f)).isTrue()
        assertThat(MeeshyCircleScaleRecipe.usesDarkInk(0.32f)).isFalse()
    }

    @Test
    fun `le tic ne suit qu'un choix qui change de niveau et jamais en mouvement reduit`() {
        val on = MeeshyCircleScaleHaptic.OnChange
        assertThat(MeeshyCircleScaleRecipe.playsHaptic(on, chosen = 3, current = 2, reduceMotion = false)).isTrue()
        assertThat(MeeshyCircleScaleRecipe.playsHaptic(on, chosen = 2, current = 2, reduceMotion = false)).isFalse()
        assertThat(MeeshyCircleScaleRecipe.playsHaptic(on, chosen = 3, current = 2, reduceMotion = true)).isFalse()
        assertThat(MeeshyCircleScaleRecipe.playsHaptic(MeeshyCircleScaleHaptic.None, 3, 2, false)).isFalse()
    }

    @Test
    fun `les comptes n'ont de sens qu'a la longueur des niveaux et un compte negatif vaut zero`() {
        assertThat(MeeshyCircleScaleRecipe.validCounts(listOf(1, 2, 3), 4)).isNull()
        assertThat(MeeshyCircleScaleRecipe.validCounts(null, 4)).isNull()
        assertThat(MeeshyCircleScaleRecipe.validCounts(listOf(1, -2, 0), 3)).containsExactly(1, 0, 0).inOrder()
    }

    @Test
    fun `un compte s'ecrit a la langue courante et zero s'ecrit 0`() {
        assertThat(MeeshyCircleScaleRecipe.countText(0, Locale.FRANCE)).isEqualTo("0")
        assertThat(MeeshyCircleScaleRecipe.countText(-4, Locale.FRANCE)).isEqualTo("0")
        assertThat(MeeshyCircleScaleRecipe.countText(1280, Locale.US)).isEqualTo("1,280")
    }
}
