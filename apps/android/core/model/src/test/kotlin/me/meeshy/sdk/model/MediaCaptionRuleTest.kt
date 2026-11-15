package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaCaptionRuleTest {

    private fun words(n: Int) = (1..n).joinToString(" ") { "m$it" }

    @Test
    fun `a caption of thirty words or less shows whole`() {
        val folded = MediaCaptionRule.collapse(words(30))

        assertThat(folded.isTruncated).isFalse()
        assertThat(folded.head).isEqualTo(words(30))
    }

    @Test
    fun `a caption past thirty words folds to its first fifteen`() {
        val folded = MediaCaptionRule.collapse(words(31))

        assertThat(folded.isTruncated).isTrue()
        assertThat(folded.head).isEqualTo(words(15))
    }

    @Test
    fun `words are counted on blanks, line breaks included`() {
        val text = (1..31).joinToString("\n\n") { "m$it" }

        assertThat(MediaCaptionRule.collapse(text).head).isEqualTo(words(15))
    }

    @Test
    fun `a text without blanks is one word and shows whole`() {
        val text = "日本語".repeat(40)

        assertThat(MediaCaptionRule.collapse(text).isTruncated).isFalse()
    }
}
