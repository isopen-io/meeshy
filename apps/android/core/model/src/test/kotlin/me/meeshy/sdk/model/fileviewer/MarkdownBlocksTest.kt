package me.meeshy.sdk.model.fileviewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MarkdownBlocksTest {

    private fun parse(text: String) = MarkdownBlocks.parse(text)

    @Test
    fun `les titres portent leur niveau`() {
        val blocks = parse("# Un\n\n### Trois")
        assertThat(blocks).containsExactly(
            MarkdownBlock.Heading(1, listOf(MarkdownSpan("Un"))),
            MarkdownBlock.Heading(3, listOf(MarkdownSpan("Trois"))),
        ).inOrder()
    }

    @Test
    fun `les lignes contigues forment un seul paragraphe`() {
        assertThat(parse("a\nb\n\nc")).containsExactly(
            MarkdownBlock.Paragraph(listOf(MarkdownSpan("a b"))),
            MarkdownBlock.Paragraph(listOf(MarkdownSpan("c"))),
        ).inOrder()
    }

    @Test
    fun `gras italique et code en ligne`() {
        val block = parse("un **gras** et *ital* et `code`").single() as MarkdownBlock.Paragraph
        assertThat(block.spans).containsExactly(
            MarkdownSpan("un "),
            MarkdownSpan("gras", bold = true),
            MarkdownSpan(" et "),
            MarkdownSpan("ital", italic = true),
            MarkdownSpan(" et "),
            MarkdownSpan("code", code = true),
        ).inOrder()
    }

    @Test
    fun `un marqueur jamais ferme reste du texte`() {
        val block = parse("2 * 3 et **ouvert").single() as MarkdownBlock.Paragraph
        assertThat(block.spans.joinToString("") { it.text }).isEqualTo("2 * 3 et **ouvert")
        assertThat(block.spans.none { it.bold || it.italic }).isTrue()
    }

    @Test
    fun `un lien montre son libelle et jamais une cible executable`() {
        val block = parse("voir [la doc](javascript:alert(1)) ici").single() as MarkdownBlock.Paragraph
        assertThat(block.spans.joinToString("") { it.text }).isEqualTo("voir la doc (javascript:alert(1)) ici")
    }

    @Test
    fun `listes a puces et numerotees`() {
        assertThat(parse("- a\n* b\n+ c")).containsExactly(
            MarkdownBlock.ListItem(null, 0, listOf(MarkdownSpan("a"))),
            MarkdownBlock.ListItem(null, 0, listOf(MarkdownSpan("b"))),
            MarkdownBlock.ListItem(null, 0, listOf(MarkdownSpan("c"))),
        ).inOrder()
        assertThat(parse("1. x\n2. y")).containsExactly(
            MarkdownBlock.ListItem(1, 0, listOf(MarkdownSpan("x"))),
            MarkdownBlock.ListItem(2, 0, listOf(MarkdownSpan("y"))),
        ).inOrder()
    }

    @Test
    fun `l'indentation d'une puce donne sa profondeur`() {
        val item = parse("  - sous").single() as MarkdownBlock.ListItem
        assertThat(item.depth).isEqualTo(1)
    }

    @Test
    fun `citation, regle et bloc de code`() {
        val blocks = parse("> cité\n\n---\n\n```kotlin\nval x = **1**\n```")
        assertThat(blocks).containsExactly(
            MarkdownBlock.Quote(listOf(MarkdownSpan("cité"))),
            MarkdownBlock.Rule,
            MarkdownBlock.CodeBlock("val x = **1**"),
        ).inOrder()
    }

    @Test
    fun `un bloc de code jamais ferme va jusqu'a la fin`() {
        assertThat(parse("```\na\nb")).containsExactly(MarkdownBlock.CodeBlock("a\nb"))
    }

    @Test
    fun `le HTML brut reste du texte inerte`() {
        val block = parse("<script>alert(1)</script>").single() as MarkdownBlock.Paragraph
        assertThat(block.spans.single().text).isEqualTo("<script>alert(1)</script>")
    }

    @Test
    fun `le nombre de blocs est borne`() {
        val many = (1..MarkdownBlocks.MAX_BLOCKS + 50).joinToString("\n\n") { "p$it" }
        assertThat(parse(many)).hasSize(MarkdownBlocks.MAX_BLOCKS)
    }

    @Test
    fun `un texte vide ne donne aucun bloc`() {
        assertThat(parse("  \n\n ")).isEmpty()
    }
}
