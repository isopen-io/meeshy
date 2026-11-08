package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerTextFormat.Style
import org.junit.Test

class ComposerTextFormatTest {

    private fun toggle(text: String, start: Int, end: Int, style: Style) = ComposerTextFormat.toggle(text, start, end, style)

    @Test fun `selection vide pose la paire et le curseur entre les deux`() {
        assertThat(toggle("ab", 1, 1, Style.BOLD)).isEqualTo(ComposerTextFormat.Result("a****b", 3, 3))
    }

    @Test fun `selection simple est encadree`() {
        assertThat(toggle("bonjour", 0, 7, Style.BOLD)).isEqualTo(ComposerTextFormat.Result("**bonjour**", 2, 9))
        assertThat(toggle("bonjour", 0, 7, Style.UNDERLINE).text).isEqualTo("__bonjour__")
        assertThat(toggle("bonjour", 0, 7, Style.STRIKETHROUGH).text).isEqualTo("~~bonjour~~")
        assertThat(toggle("bonjour", 0, 7, Style.ITALIC).text).isEqualTo("*bonjour*")
    }

    @Test fun `les blancs de bord restent hors de l'emphase`() {
        assertThat(toggle("a bonjour b", 1, 10, Style.BOLD)).isEqualTo(ComposerTextFormat.Result("a **bonjour** b", 4, 11))
    }

    @Test fun `une selection de blancs ne change rien`() {
        assertThat(toggle("a   b", 1, 4, Style.BOLD)).isEqualTo(ComposerTextFormat.Result("a   b", 1, 4))
    }

    @Test fun `deja encadree autour retire l'emphase`() {
        assertThat(toggle("**bonjour**", 2, 9, Style.BOLD)).isEqualTo(ComposerTextFormat.Result("bonjour", 0, 7))
    }

    @Test fun `deja encadree dedans retire l'emphase`() {
        assertThat(toggle("**bonjour**", 0, 11, Style.BOLD)).isEqualTo(ComposerTextFormat.Result("bonjour", 0, 7))
    }

    @Test fun `l'italique ne se confond pas avec le gras`() {
        assertThat(toggle("**bonjour**", 2, 9, Style.ITALIC).text).isEqualTo("***bonjour***")
        assertThat(toggle("***bonjour***", 3, 10, Style.ITALIC).text).isEqualTo("**bonjour**")
    }

    @Test fun `les positions se comptent en graphemes`() {
        val family = "e\u0301"
        assertThat(toggle("${family}ab", 1, 3, Style.BOLD)).isEqualTo(ComposerTextFormat.Result("$family**ab**", 3, 5))
    }

    @Test fun `les positions rendues sont bornees au texte rendu`() {
        val r = toggle("**a**", 0, 5, Style.BOLD)
        assertThat(r.end).isAtMost(r.text.length)
    }

    @Test fun `conversion utf16 graphemes aller retour`() {
        val text = "ae\u0301b"
        assertThat(ComposerTextFormat.graphemeIndex(text, text.length)).isEqualTo(3)
        assertThat(ComposerTextFormat.utf16Offset(text, 2)).isEqualTo(3)
        assertThat(ComposerTextFormat.utf16Offset(text, 99)).isEqualTo(text.length)
    }
}
