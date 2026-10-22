package me.meeshy.sdk.model.text

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TextBlocksTest {

    @Test fun `empty text has no block`() {
        assertThat(TextBlocks.parse("")).isEmpty()
    }

    @Test fun `plain text is one identical paragraph`() {
        assertThat(TextBlocks.parse("salut\ntout le monde")).containsExactly(TextBlock.Paragraph("salut\ntout le monde"))
        assertThat(TextBlocks.hasBlockSyntax("salut 1 + 1")).isFalse()
    }

    @Test fun `a hashtag is not a heading`() {
        assertThat(TextBlocks.hasBlockSyntax("#projet")).isFalse()
        assertThat(TextBlocks.parse("#projet")).containsExactly(TextBlock.Paragraph("#projet"))
    }

    @Test fun `headings carry their level up to three`() {
        assertThat(TextBlocks.parse("# A\n## B\n### C\n#### D")).containsExactly(
            TextBlock.Heading(1, "A"),
            TextBlock.Heading(2, "B"),
            TextBlock.Heading(3, "C"),
            TextBlock.Paragraph("#### D"),
        ).inOrder()
    }

    @Test fun `bullets of any marker group into one list`() {
        assertThat(TextBlocks.parse("- a\n* b\n+ c")).containsExactly(
            TextBlock.ListBlock(ordered = false, start = 1, items = listOf("a", "b", "c")),
        )
    }

    @Test fun `ordered list keeps its start number and both delimiters`() {
        assertThat(TextBlocks.parse("3. a\n4) b")).containsExactly(
            TextBlock.ListBlock(ordered = true, start = 3, items = listOf("a", "b")),
        )
    }

    @Test fun `consecutive quote lines merge without the marker`() {
        assertThat(TextBlocks.parse("> un\n>deux\n> ")).containsExactly(TextBlock.Quote("un\ndeux\n"))
    }

    @Test fun `fenced code is literal and keeps its language`() {
        assertThat(TextBlocks.parse("```kotlin\nval a = **b**\n# x\n```\nfin")).containsExactly(
            TextBlock.Code("kotlin", "val a = **b**\n# x"),
            TextBlock.Paragraph("fin"),
        ).inOrder()
    }

    @Test fun `unclosed fence swallows the rest`() {
        assertThat(TextBlocks.parse("```\na\nb")).containsExactly(TextBlock.Code(null, "a\nb"))
    }

    @Test fun `paragraph around blocks drops surrounding blank lines`() {
        assertThat(TextBlocks.parse("\nintro\n\n- a")).containsExactly(
            TextBlock.Paragraph("intro"),
            TextBlock.ListBlock(false, 1, listOf("a")),
        ).inOrder()
    }
}
