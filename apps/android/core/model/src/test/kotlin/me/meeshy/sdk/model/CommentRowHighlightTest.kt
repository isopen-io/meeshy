package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentRowHighlightTest {

    @Test
    fun `anchor is comment dash id`() {
        assertThat(CommentRowHighlight.anchor("abc")).isEqualTo("comment-abc")
    }

    @Test
    fun `parses an anchor back and rejects others`() {
        assertThat(CommentRowHighlight.commentIdOf("comment-abc")).isEqualTo("abc")
        assertThat(CommentRowHighlight.commentIdOf("post-abc")).isNull()
        assertThat(CommentRowHighlight.commentIdOf("comment-")).isNull()
    }

    @Test
    fun `only the target row is highlighted`() {
        assertThat(CommentRowHighlight.isHighlighted("a", targetId = "a")).isTrue()
        assertThat(CommentRowHighlight.isHighlighted("b", targetId = "a")).isFalse()
        assertThat(CommentRowHighlight.isHighlighted("a", targetId = null)).isFalse()
    }

    @Test
    fun `the highlight is fleeting`() {
        assertThat(CommentRowHighlight.DURATION_MILLIS).isAtLeast(1_000L)
        assertThat(CommentRowHighlight.DURATION_MILLIS).isAtMost(5_000L)
    }
}
