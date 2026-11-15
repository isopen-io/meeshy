package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Un fichier reçu est HOSTILE par défaut : 512 Kio d'une seule ligne construite pour faire exploser l'analyse
 * (retours arrière quadratiques, récursion du moteur d'expressions) ne doit ni geler la lecture ni la faire tomber.
 */
class MarkdownBlocksHostileTest {

    private fun parsesWithin(millis: Long, text: String): List<MarkdownBlock> {
        val started = System.nanoTime()
        val blocks = MarkdownBlocks.parse(text)
        val elapsed = (System.nanoTime() - started) / 1_000_000
        assertThat(elapsed).isLessThan(millis)
        return blocks
    }

    private val hostileSize = BoundedTextReader.DEFAULT_MAX_BYTES

    @Test
    fun `une ligne de crochets ouverts sans fermeture finit vite`() {
        parsesWithin(2_000, "[".repeat(hostileSize))
    }

    @Test
    fun `des libelles fermes sans cible repetes finissent vite`() {
        parsesWithin(2_000, "[a](".repeat(hostileSize / 4))
    }

    @Test
    fun `une cible de lien immense ne fait pas deborder la pile`() {
        parsesWithin(2_000, "[a](" + "x".repeat(hostileSize - 5) + ")")
    }

    @Test
    fun `un titre suivi d'un long blanc puis d'un mot finit vite`() {
        parsesWithin(2_000, "# a" + " ".repeat(hostileSize - 4) + "b")
    }

    @Test
    fun `des marqueurs d'emphase alternes finissent vite`() {
        parsesWithin(2_000, "*_".repeat(hostileSize / 2))
        parsesWithin(2_000, "**a ".repeat(hostileSize / 4))
        parsesWithin(2_000, "`".repeat(hostileSize))
    }

    @Test
    fun `un paragraphe demesure est ecrete a la borne d'affichage`() {
        val block = parsesWithin(2_000, "a".repeat(hostileSize)).single() as MarkdownBlock.Paragraph
        val shown = block.spans.joinToString("") { it.text }
        assertThat(shown.length).isAtMost(MarkdownBlocks.MAX_BLOCK_CHARS + 1)
        assertThat(shown).endsWith("…")
    }

    @Test
    fun `les liens imbriques et parentheses gardent leur lecture`() {
        val block = MarkdownBlocks.parse("[[x](a(b)c)] et [vide]() et [non](a b)").single() as MarkdownBlock.Paragraph
        assertThat(block.spans.joinToString("") { it.text }).isEqualTo("[x (a(b)c)] et vide et [non](a b)")
    }

    @Test
    fun `un titre garde son texte et perd sa sequence fermante`() {
        assertThat(MarkdownBlocks.parse("##   Titre  ##  ")).containsExactly(MarkdownBlock.Heading(2, listOf(MarkdownSpan("Titre"))))
        assertThat(MarkdownBlocks.parse("#sans espace").single()).isInstanceOf(MarkdownBlock.Paragraph::class.java)
        assertThat(MarkdownBlocks.parse("####### sept").single()).isInstanceOf(MarkdownBlock.Paragraph::class.java)
    }
}
