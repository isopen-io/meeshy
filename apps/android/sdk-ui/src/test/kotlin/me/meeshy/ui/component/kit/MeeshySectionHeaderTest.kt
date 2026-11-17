package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K44 — l'en-tête de section : cinq formes, trois contextes, un compteur absent ne rend ni nombre ni écart. */
class MeeshySectionHeaderTest {

    private fun resolve(
        form: MeeshySectionHeaderForm = MeeshySectionHeaderForm.Title,
        size: MeeshySectionHeaderSize = MeeshySectionHeaderSize.Page,
        count: Int? = null,
        isCollapsible: Boolean = false,
        isExpanded: Boolean = true,
        isPressed: Boolean = false,
        isLive: Boolean = false,
        textScale: Double = 1.0,
    ) = MeeshySectionHeaderRecipe.resolve(form, size, count, isCollapsible, isExpanded, isPressed, isLive, textScale)

    @Test
    fun `le titre fait 22 en page 19 en feuille et 26 en colonne large`() {
        assertThat(MeeshySectionHeaderSize.entries.map { MeeshySectionHeaderRecipe.titleFontSize(MeeshySectionHeaderForm.Title, it) })
            .containsExactly(22.0, 19.0, 26.0).inOrder()
    }

    @Test
    fun `le sur titre le separateur et l etape ont leur propre police`() {
        assertThat(MeeshySectionHeaderRecipe.titleFontSize(MeeshySectionHeaderForm.Overline, MeeshySectionHeaderSize.Page)).isEqualTo(11.0)
        assertThat(MeeshySectionHeaderRecipe.titleFontSize(MeeshySectionHeaderForm.Divider, MeeshySectionHeaderSize.Sheet)).isEqualTo(11.0)
        assertThat(MeeshySectionHeaderRecipe.titleFontSize(MeeshySectionHeaderForm.Step, MeeshySectionHeaderSize.Page)).isEqualTo(19.0)
    }

    @Test
    fun `seul le sur titre est en capitales et seul le separateur trace des filets`() {
        assertThat(resolve(form = MeeshySectionHeaderForm.Overline).isUppercase).isTrue()
        assertThat(resolve().isUppercase).isFalse()
        assertThat(resolve(form = MeeshySectionHeaderForm.Divider).showsRules).isTrue()
        assertThat(resolve().showsRules).isFalse()
    }

    @Test
    fun `un compteur absent ou nul ne rend ni nombre ni ecart`() {
        assertThat(resolve(count = null).showsCount).isFalse()
        assertThat(resolve(count = 0).showsCount).isFalse()
        assertThat(resolve(count = 0).countGap).isEqualTo(0.0)
        assertThat(resolve(count = 12).showsCount).isTrue()
        assertThat(resolve(count = 12).countGap).isEqualTo(8.0)
    }

    @Test
    fun `la tete fait 32 l etape 26 et la colonne large 44`() {
        assertThat(resolve().leadingSize).isEqualTo(32.0)
        assertThat(resolve(form = MeeshySectionHeaderForm.Step).leadingSize).isEqualTo(26.0)
        assertThat(resolve(size = MeeshySectionHeaderSize.Column).leadingSize).isEqualTo(44.0)
    }

    @Test
    fun `la ligne fait 44 au moins`() {
        assertThat(resolve().minHeight).isEqualTo(44.0)
    }

    @Test
    fun `repliable la ligne entiere se touche le chevron se retourne replie et l appui voile de 9 pour cent`() {
        val collapsed = resolve(isCollapsible = true, isExpanded = false, isPressed = true)
        assertThat(collapsed.showsChevron).isTrue()
        assertThat(collapsed.chevronDegrees).isEqualTo(180.0)
        assertThat(collapsed.isWholeRowTappable).isTrue()
        assertThat(collapsed.pressVeil).isEqualTo(0.09)
        assertThat(collapsed.pressScale).isEqualTo(0.985)
        assertThat(resolve(isCollapsible = true, isExpanded = true).chevronDegrees).isEqualTo(0.0)
        val fixed = resolve(isPressed = true)
        assertThat(fixed.showsChevron).isFalse()
        assertThat(fixed.pressVeil).isEqualTo(0.0)
        assertThat(fixed.pressScale).isEqualTo(1.0)
    }

    @Test
    fun `le temoin en direct est un point de 8 avec un ecart de 10 sinon rien`() {
        assertThat(resolve(isLive = true).liveDotSize).isEqualTo(8.0)
        assertThat(resolve(isLive = true).liveDotGap).isEqualTo(10.0)
        assertThat(resolve().liveDotSize).isEqualTo(0.0)
    }

    @Test
    fun `au grand texte l accessoire passe sous le titre`() {
        assertThat(resolve(textScale = 1.6).accessoryBelowTitle).isTrue()
        assertThat(resolve(textScale = 1.0).accessoryBelowTitle).isFalse()
    }

    @Test
    fun `l etape faite est une coche en cours un aplat et a faire un contour`() {
        assertThat(MeeshySectionHeaderRecipe.stepAppearance(MeeshySectionHeaderStepState.Done)).isEqualTo(MeeshySectionHeaderStepAppearance.Check)
        assertThat(MeeshySectionHeaderRecipe.stepAppearance(MeeshySectionHeaderStepState.Current)).isEqualTo(MeeshySectionHeaderStepAppearance.Filled)
        assertThat(MeeshySectionHeaderRecipe.stepAppearance(MeeshySectionHeaderStepState.Todo)).isEqualTo(MeeshySectionHeaderStepAppearance.Outlined)
    }
}
