package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SyntaxLineClampTest {

    @Test
    fun `une ligne courte s'affiche entiere`() {
        val line = SyntaxTokenizer.tokenize("val x = 1", CodeLanguage.KOTLIN).single()
        assertThat(SyntaxTokenizer.clampLine(line)).isEqualTo(line)
    }

    @Test
    fun `une ligne d'un demi-megaoctet s'affiche coupee avec une ellipse`() {
        val line = SyntaxTokenizer.tokenize("if ".repeat(170_000), CodeLanguage.KOTLIN).single()
        val shown = SyntaxTokenizer.clampLine(line, maxChars = 100)
        assertThat(shown.dropLast(1).sumOf { it.text.length }).isEqualTo(100)
        assertThat(shown.last().text).isEqualTo("…")
    }

    @Test
    fun `le pire cas de la coloration reste lineaire`() {
        val hostile = listOf("/*".repeat(260_000), "\"".repeat(520_000), "'\\".repeat(260_000), "#".repeat(520_000))
        hostile.forEach { code ->
            val started = System.nanoTime()
            SyntaxTokenizer.tokenize(code, CodeLanguage.PYTHON)
            SyntaxTokenizer.tokenize(code, CodeLanguage.JAVASCRIPT)
            assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(2_000)
        }
    }
}
