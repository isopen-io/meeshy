package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K39 — la rangée de personne : cinq tailles, trois tenues, une sélection, une seule phrase dite. */
class MeeshyPersonRowTest {

    private fun resolve(
        size: MeeshyPersonRowSize = MeeshyPersonRowSize.Regular,
        outfit: MeeshyPersonRowOutfit = MeeshyPersonRowOutfit.Normal,
        selection: MeeshyPersonRowSelection = MeeshyPersonRowSelection.None,
        hasPress: Boolean = false,
        isPressed: Boolean = false,
        textScale: Double = 1.0,
    ) = MeeshyPersonRowRecipe.resolve(size, outfit, selection, hasPress, isPressed, textScale)

    @Test
    fun `l avatar fait 36 44 56 56 et 26 et la rangee 52 64 76 88 et 32`() {
        assertThat(MeeshyPersonRowSize.entries.map { MeeshyPersonRowRecipe.avatarSize(it) }).containsExactly(36.0, 44.0, 56.0, 56.0, 26.0).inOrder()
        assertThat(MeeshyPersonRowSize.entries.map { MeeshyPersonRowRecipe.rowHeight(it) }).containsExactly(52.0, 64.0, 76.0, 88.0, 32.0).inOrder()
    }

    @Test
    fun `le titre fait 15 sauf 22 en tete de feuille et 13 dans une phrase`() {
        assertThat(MeeshyPersonRowRecipe.titleFontSize(MeeshyPersonRowSize.Regular)).isEqualTo(15.0)
        assertThat(MeeshyPersonRowRecipe.titleFontSize(MeeshyPersonRowSize.Header)).isEqualTo(22.0)
        assertThat(MeeshyPersonRowRecipe.titleFontSize(MeeshyPersonRowSize.Inline)).isEqualTo(13.0)
    }

    @Test
    fun `le filet commence sous le texte et la tete ou la phrase n en ont pas`() {
        assertThat(resolve().dividerInset).isEqualTo(18.0 + 44.0 + 14.0)
        assertThat(resolve().showsDivider).isTrue()
        assertThat(resolve(size = MeeshyPersonRowSize.Header).showsDivider).isFalse()
        assertThat(resolve(size = MeeshyPersonRowSize.Inline).showsDivider).isFalse()
    }

    @Test
    fun `attenuee l avatar tombe a 40 pour cent et fantome il cede sa place a un disque pointille`() {
        assertThat(resolve(outfit = MeeshyPersonRowOutfit.Muted).avatarOpacity).isEqualTo(0.4)
        assertThat(resolve(outfit = MeeshyPersonRowOutfit.Muted).isMutedText).isTrue()
        assertThat(resolve(outfit = MeeshyPersonRowOutfit.Ghost).isAvatarGhost).isTrue()
        assertThat(resolve().isMutedText).isFalse()
        assertThat(resolve().avatarOpacity).isEqualTo(1.0)
    }

    @Test
    fun `la rangee n est pressable que si elle porte une action ou une selection et jamais en tete`() {
        assertThat(resolve().isPressable).isFalse()
        assertThat(resolve(hasPress = true).isPressable).isTrue()
        assertThat(resolve(selection = MeeshyPersonRowSelection.Multiple(false)).isPressable).isTrue()
        assertThat(resolve(size = MeeshyPersonRowSize.Header, hasPress = true).isPressable).isFalse()
    }

    @Test
    fun `l appui voile de 8 pour cent sans deplacer et seulement sur une rangee pressable`() {
        assertThat(resolve(hasPress = true, isPressed = true).pressVeil).isEqualTo(0.08)
        assertThat(resolve(isPressed = true).pressVeil).isEqualTo(0.0)
        assertThat(resolve(hasPress = true, isPressed = true).pressScale).isEqualTo(1.0)
    }

    @Test
    fun `un seul choix est un point plein et plusieurs sont une coche`() {
        assertThat(resolve(selection = MeeshyPersonRowSelection.Single(true)).selectionShape).isEqualTo(MeeshyPersonRowSelectionShape.Dot)
        assertThat(resolve(selection = MeeshyPersonRowSelection.Multiple(true)).selectionShape).isEqualTo(MeeshyPersonRowSelectionShape.Check)
        assertThat(resolve(selection = MeeshyPersonRowSelection.Multiple(true)).isSelected).isTrue()
        assertThat(resolve(selection = MeeshyPersonRowSelection.Single(false)).isSelected).isFalse()
        assertThat(resolve().showsSelectionMark).isFalse()
        assertThat(resolve().selectionShape).isNull()
    }

    @Test
    fun `au grand texte la meta passe sous le sous titre`() {
        assertThat(resolve(textScale = 1.6).metaBelowSubtitle).isTrue()
        assertThat(resolve(textScale = 1.0).metaBelowSubtitle).isFalse()
    }

    @Test
    fun `la phrase dite omet les parties vides dans l ordre recu`() {
        assertThat(MeeshyPersonRowRecipe.spokenLabel(listOf("Alice", null, "", "en ligne"))).isEqualTo("Alice, en ligne")
        assertThat(MeeshyPersonRowRecipe.spokenLabel(emptyList())).isEqualTo("")
    }
}
