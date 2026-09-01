package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The plain-text highlight segmenter — `MessageTextParser.highlightedSegments`,
 * the pure SSOT that turns a raw content string + a search term into alternating
 * highlighted / plain runs. It is the decision a plain-text search-result row
 * needs (iOS `highlightedText`): the Compose layer only maps each run onto a
 * styled span (glue, no decisions), so every branch of the split — no match, a
 * match at each boundary position, several matches, adjacent matches, a
 * whole-string match, and accent-folded matches whose length differs from the
 * term — is pinned here through the public API.
 *
 * The load-bearing invariant, asserted on every non-trivial case: the segments
 * concatenate back to the ORIGINAL text with no gaps and no overlaps.
 */
class MessageTextParserHighlightSegmentsTest {

    private val T = MessageTextParser

    private fun reassemble(segments: List<HighlightSegment>): String =
        segments.joinToString("") { it.text }

    @Test
    fun emptyTextYieldsNoSegments() {
        assertThat(T.highlightedSegments(text = "", term = "a")).isEmpty()
    }

    @Test
    fun emptyTermYieldsASinglePlainSegmentOverTheWholeText() {
        val segments = T.highlightedSegments(text = "hello world", term = "")

        assertThat(segments).containsExactly(HighlightSegment("hello world", highlighted = false))
    }

    @Test
    fun aTermThatFoldsAwayToNothingYieldsASinglePlainSegment() {
        // A combining acute accent alone folds to the empty needle → no match.
        val segments = T.highlightedSegments(text = "cafe", term = "́")

        assertThat(segments).containsExactly(HighlightSegment("cafe", highlighted = false))
    }

    @Test
    fun anUnmatchedTermYieldsASinglePlainSegment() {
        val segments = T.highlightedSegments(text = "hello world", term = "xyz")

        assertThat(segments).containsExactly(HighlightSegment("hello world", highlighted = false))
    }

    @Test
    fun aMatchInTheMiddleSplitsIntoPlainHighlightedPlain() {
        val segments = T.highlightedSegments(text = "say hello now", term = "hello")

        assertThat(segments).containsExactly(
            HighlightSegment("say ", highlighted = false),
            HighlightSegment("hello", highlighted = true),
            HighlightSegment(" now", highlighted = false),
        ).inOrder()
        assertThat(reassemble(segments)).isEqualTo("say hello now")
    }

    @Test
    fun aMatchAtTheStartLeadsWithTheHighlightedSegment() {
        val segments = T.highlightedSegments(text = "hello there", term = "hello")

        assertThat(segments).containsExactly(
            HighlightSegment("hello", highlighted = true),
            HighlightSegment(" there", highlighted = false),
        ).inOrder()
        assertThat(reassemble(segments)).isEqualTo("hello there")
    }

    @Test
    fun aMatchAtTheEndTrailsWithTheHighlightedSegment() {
        val segments = T.highlightedSegments(text = "well hello", term = "hello")

        assertThat(segments).containsExactly(
            HighlightSegment("well ", highlighted = false),
            HighlightSegment("hello", highlighted = true),
        ).inOrder()
        assertThat(reassemble(segments)).isEqualTo("well hello")
    }

    @Test
    fun aWholeStringMatchYieldsASingleHighlightedSegment() {
        val segments = T.highlightedSegments(text = "hello", term = "hello")

        assertThat(segments).containsExactly(HighlightSegment("hello", highlighted = true))
    }

    @Test
    fun everyOccurrenceIsHighlightedWithPlainFillersBetween() {
        val segments = T.highlightedSegments(text = "ba ba ba", term = "ba")

        assertThat(segments).containsExactly(
            HighlightSegment("ba", highlighted = true),
            HighlightSegment(" ", highlighted = false),
            HighlightSegment("ba", highlighted = true),
            HighlightSegment(" ", highlighted = false),
            HighlightSegment("ba", highlighted = true),
        ).inOrder()
        assertThat(reassemble(segments)).isEqualTo("ba ba ba")
    }

    @Test
    fun adjacentOccurrencesProduceBackToBackHighlightedSegmentsWithNoEmptyFiller() {
        val segments = T.highlightedSegments(text = "abab", term = "ab")

        assertThat(segments).containsExactly(
            HighlightSegment("ab", highlighted = true),
            HighlightSegment("ab", highlighted = true),
        ).inOrder()
        assertThat(segments.none { it.text.isEmpty() }).isTrue()
        assertThat(reassemble(segments)).isEqualTo("abab")
    }

    @Test
    fun theMatchIsCaseInsensitiveAndKeepsTheOriginalCasingInTheSegment() {
        val segments = T.highlightedSegments(text = "Hello World", term = "hello")

        assertThat(segments).containsExactly(
            HighlightSegment("Hello", highlighted = true),
            HighlightSegment(" World", highlighted = false),
        ).inOrder()
    }

    @Test
    fun anUnaccentedTermHighlightsTheAccentedGraphemeWholeAndPreservesIt() {
        // "cafe" folds to match "café"; the highlighted run keeps the accented
        // char intact and the segments still reassemble to the original.
        val segments = T.highlightedSegments(text = "un café ici", term = "cafe")

        assertThat(segments).containsExactly(
            HighlightSegment("un ", highlighted = false),
            HighlightSegment("café", highlighted = true),
            HighlightSegment(" ici", highlighted = false),
        ).inOrder()
        assertThat(reassemble(segments)).isEqualTo("un café ici")
    }
}
