package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K47 — les tuiles de choix : une tuile choisit, trois signes la marquent. */
class MeeshyChoiceTilesTest {

    private fun resolve(
        content: MeeshyChoiceContent = MeeshyChoiceContent.Option,
        format: MeeshyChoiceFormat = MeeshyChoiceFormat.Square,
        columns: Int? = 2,
        isSelected: Boolean = false,
        isPressed: Boolean = false,
        state: MeeshyChoiceItemState = MeeshyChoiceItemState.Enabled,
        reduceMotion: Boolean = false,
    ) = MeeshyChoiceTilesRecipe.resolve(content, format, MeeshyChoiceSurface.Tonal, columns, isSelected, isPressed, state, reduceMotion)

    @Test
    fun `les colonnes sont bornees a 2 4, deux par defaut`() {
        assertThat(MeeshyChoiceTilesRecipe.columns(null)).isEqualTo(2)
        assertThat(MeeshyChoiceTilesRecipe.columns(1)).isEqualTo(2)
        assertThat(MeeshyChoiceTilesRecipe.columns(9)).isEqualTo(4)
        assertThat(MeeshyChoiceTilesRecipe.columns(3)).isEqualTo(3)
    }

    @Test
    fun `choisie - bord de 2, fond teinte et coche, trois signes a la fois`() {
        val v = resolve(isSelected = true)
        assertThat(v.borderDp).isEqualTo(2f)
        assertThat(v.tintedFill).isTrue()
        assertThat(v.showsCheck).isTrue()
        assertThat(resolve().borderDp).isEqualTo(1f)
        assertThat(resolve().showsCheck).isFalse()
    }

    @Test
    fun `une tuile d icone choisie inverse son disque au lieu d une coche`() {
        val v = resolve(content = MeeshyChoiceContent.Icon, isSelected = true)
        assertThat(v.invertsDisc).isTrue()
        assertThat(v.showsCheck).isFalse()
        assertThat(v.headDp).isEqualTo(54f)
    }

    @Test
    fun `verrouillee ou inactive elle ne se marque ni ne s enfonce`() {
        val locked = resolve(isSelected = true, isPressed = true, state = MeeshyChoiceItemState.Locked("Premium"))
        assertThat(locked.isLocked).isTrue()
        assertThat(locked.showsCheck).isFalse()
        assertThat(locked.pressScale).isEqualTo(1f)
        assertThat(locked.borderDp).isEqualTo(1.5f)
        val off = resolve(isSelected = true, state = MeeshyChoiceItemState.Disabled)
        assertThat(off.opacity).isEqualTo(0.4f)
        assertThat(off.tintedFill).isFalse()
    }

    @Test
    fun `pressee - 0,96 et un voile de 13 pour cent, sans echelle en mouvement reduit`() {
        assertThat(resolve(isPressed = true).pressScale).isEqualTo(0.96f)
        assertThat(resolve(isPressed = true).pressVeil).isEqualTo(0.13f)
        val calm = resolve(isPressed = true, reduceMotion = true)
        assertThat(calm.pressScale).isEqualTo(1f)
        assertThat(calm.pressVeil).isEqualTo(0.13f)
        assertThat(calm.checkFades).isTrue()
    }

    @Test
    fun `les formats donnent rayon, marge et hauteur`() {
        val wide = resolve(format = MeeshyChoiceFormat.Wide)
        assertThat(wide.minHeightDp).isEqualTo(80f)
        val compact = resolve(format = MeeshyChoiceFormat.Compact)
        assertThat(compact.radiusDp).isEqualTo(22f)
        assertThat(compact.paddingDp).isEqualTo(11f)
        assertThat(resolve(content = MeeshyChoiceContent.Value).minHeightDp).isEqualTo(132f)
    }

    @Test
    fun `la valeur serre sa taille a quatre colonnes`() {
        assertThat(resolve(columns = 2).valueSp).isEqualTo(40f)
        assertThat(resolve(columns = 4).valueSp).isEqualTo(30f)
    }

    @Test
    fun `la selection est entiere a l hote - une ou plusieurs`() {
        assertThat(MeeshyChoiceSelection.Single("a").contains("a")).isTrue()
        assertThat(MeeshyChoiceSelection.Single(null).contains("a")).isFalse()
        assertThat(MeeshyChoiceSelection.Multiple(setOf("a", "b")).contains("b")).isTrue()
        assertThat(MeeshyChoiceSelection.Multiple(setOf("a")).contains("c")).isFalse()
    }
}
