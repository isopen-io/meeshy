package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K55 — la loi de la touche de raccourci : elle montre la touche, elle n'écoute pas le clavier. */
class MeeshyKeyHintTest {

    private val cmdM = listOf(MeeshyKey.Primary, MeeshyKey.Character("m"))

    @Test
    fun `primary est la boucle de Commande sur Apple et Ctrl ailleurs`() {
        assertThat(MeeshyKeyHintRule.glyphs(cmdM, MeeshyKeyPlatform.Apple)).containsExactly("⌘", "M").inOrder()
        assertThat(MeeshyKeyHintRule.glyphs(cmdM, MeeshyKeyPlatform.Other)).containsExactly("Ctrl", "M").inOrder()
    }

    @Test
    fun `une lettre s'ecrit en capitale, les noms courts restent des noms`() {
        assertThat(MeeshyKeyHintRule.glyphs(listOf(MeeshyKey.Character("k")), MeeshyKeyPlatform.Other)).containsExactly("K")
        assertThat(MeeshyKeyHintRule.glyphs(listOf(MeeshyKey.Escape), MeeshyKeyPlatform.Other)).containsExactly("Esc")
        assertThat(MeeshyKeyHintRule.glyphs(listOf(MeeshyKey.Shift, MeeshyKey.Enter), MeeshyKeyPlatform.Apple)).containsExactly("⇧", "↩").inOrder()
    }

    @Test
    fun `les fleches ont leur glyphe sur les deux machines`() {
        val arrows = listOf(MeeshyKey.Up, MeeshyKey.Down, MeeshyKey.Left, MeeshyKey.Right)
        assertThat(MeeshyKeyHintRule.glyphs(arrows, MeeshyKeyPlatform.Other)).containsExactly("↑", "↓", "←", "→").inOrder()
    }

    @Test
    fun `la voix dit raccourci Commande M, et Control M ailleurs`() {
        assertThat(MeeshyKeyHintRule.spoken(cmdM, MeeshyKeyPlatform.Apple, prefix = "raccourci")).isEqualTo("raccourci : Command M")
        assertThat(MeeshyKeyHintRule.spoken(cmdM, MeeshyKeyPlatform.Other, prefix = "raccourci")).isEqualTo("raccourci : Control M")
    }

    @Test
    fun `une touche n'est montree que si le clavier est la et la commande active`() {
        assertThat(MeeshyKeyHintRule.isShown(hasKeyboard = true, isEnabled = true)).isTrue()
        assertThat(MeeshyKeyHintRule.isShown(hasKeyboard = false, isEnabled = true)).isFalse()
        assertThat(MeeshyKeyHintRule.isShown(hasKeyboard = true, isEnabled = false)).isFalse()
    }

    @Test
    fun `vide ou sans clavier, rien n'est rendu et aucune place reservee`() {
        assertThat(MeeshyKeyHintRecipe.resolve(emptyList(), MeeshyKeyHintContext.Free, MeeshyKeyHintSize.Regular, hasKeyboard = true, isPressed = false, reduceMotion = false).isRendered).isFalse()
        assertThat(MeeshyKeyHintRecipe.resolve(cmdM, MeeshyKeyHintContext.Free, MeeshyKeyHintSize.Regular, hasKeyboard = false, isPressed = false, reduceMotion = false).isRendered).isFalse()
    }

    @Test
    fun `une combinaison porte au plus trois touches`() {
        val four = listOf(MeeshyKey.Primary, MeeshyKey.Shift, MeeshyKey.Option, MeeshyKey.Character("z"))
        assertThat(MeeshyKeyHintRecipe.resolve(four, MeeshyKeyHintContext.Free, MeeshyKeyHintSize.Regular, hasKeyboard = true, isPressed = false, reduceMotion = false).keyCount).isEqualTo(3)
    }

    @Test
    fun `touche de 26, rayon 8, marge 6, ecart 4 ; compacte 20 et 3`() {
        val regular = MeeshyKeyHintRecipe.resolve(cmdM, MeeshyKeyHintContext.Free, MeeshyKeyHintSize.Regular, hasKeyboard = true, isPressed = false, reduceMotion = false)
        assertThat(regular.sizeDp).isEqualTo(26)
        assertThat(regular.cornerRadiusDp).isEqualTo(8)
        assertThat(regular.paddingDp).isEqualTo(6)
        assertThat(regular.gapDp).isEqualTo(4)
        assertThat(regular.textSp).isEqualTo(12.5f)
        val compact = MeeshyKeyHintRecipe.resolve(cmdM, MeeshyKeyHintContext.Free, MeeshyKeyHintSize.Compact, hasKeyboard = true, isPressed = false, reduceMotion = false)
        assertThat(compact.sizeDp).isEqualTo(20)
        assertThat(compact.gapDp).isEqualTo(3)
        assertThat(compact.textSp).isEqualTo(10.5f)
    }

    @Test
    fun `enfoncee - 1,5 plus bas et a l'accent ; en mouvement reduit elle change de teinte sans descendre`() {
        val pressed = MeeshyKeyHintRecipe.resolve(cmdM, MeeshyKeyHintContext.Free, MeeshyKeyHintSize.Regular, hasKeyboard = true, isPressed = true, reduceMotion = false)
        assertThat(pressed.pressedOffsetDp).isEqualTo(1.5f)
        assertThat(pressed.usesAccent).isTrue()
        val reduced = MeeshyKeyHintRecipe.resolve(cmdM, MeeshyKeyHintContext.Free, MeeshyKeyHintSize.Regular, hasKeyboard = true, isPressed = true, reduceMotion = true)
        assertThat(reduced.pressedOffsetDp).isEqualTo(0f)
        assertThat(reduced.usesAccent).isTrue()
        assertThat(MeeshyKeyHintRecipe.PRESS_MILLIS).isEqualTo(120)
    }

    @Test
    fun `la legende - paire a 6, groupes a 10, barre de 44 et rayon 14`() {
        assertThat(MeeshyKeyLegendRule.PAIR_GAP_DP).isEqualTo(6)
        assertThat(MeeshyKeyLegendRule.GROUP_GAP_DP).isEqualTo(10)
        assertThat(MeeshyKeyLegendRule.BAR_HEIGHT_DP).isEqualTo(44)
        assertThat(MeeshyKeyLegendRule.BAR_RADIUS_DP).isEqualTo(14)
    }

    @Test
    fun `le filet de groupe ne se pose jamais avant la premiere paire`() {
        val items = listOf(
            MeeshyKeyLegendItem("a", listOf(cmdM), "Envoyer", startsGroup = true),
            MeeshyKeyLegendItem("b", listOf(cmdM), "Fermer", startsGroup = true),
            MeeshyKeyLegendItem("c", listOf(cmdM), "Aide", startsGroup = false),
        )
        assertThat(MeeshyKeyLegendRule.rulesBefore(items)).containsExactly(false, true, false).inOrder()
    }
}
