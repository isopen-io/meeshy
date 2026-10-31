package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ComposerMode
import org.junit.Test

class CommentComposerTextTest {

    @Test
    fun `an emoji lands at the cursor and the cursor follows it`() {
        val edit = CommentComposerText.insert(text = "Bravo !", selectionStart = 5, selectionEnd = 5, inserted = "🔥")
        assertThat(edit.text).isEqualTo("Bravo🔥 !")
        assertThat(edit.cursor).isEqualTo(5 + "🔥".length)
    }

    @Test
    fun `an emoji replaces the selected text`() {
        val edit = CommentComposerText.insert(text = "super cool", selectionStart = 6, selectionEnd = 10, inserted = "😍")
        assertThat(edit.text).isEqualTo("super 😍")
        assertThat(edit.cursor).isEqualTo(edit.text.length)
    }

    @Test
    fun `a reversed or out of range selection never crashes`() {
        val edit = CommentComposerText.insert(text = "abc", selectionStart = 9, selectionEnd = 1, inserted = "!")
        assertThat(edit.text).isEqualTo("a!")
        assertThat(edit.cursor).isEqualTo(2)
    }

    @Test
    fun `an insertion that would overflow the comment budget is refused`() {
        val full = "a".repeat(ComposerMode.COMMENT.maxLength!!)
        val edit = CommentComposerText.insert(text = full, selectionStart = full.length, selectionEnd = full.length, inserted = "🔥")
        assertThat(edit.text).isEqualTo(full)
        assertThat(edit.cursor).isEqualTo(full.length)
    }

    @Test
    fun `typed text is bounded to the comment budget`() {
        val over = "b".repeat(ComposerMode.COMMENT.maxLength!! + 10)
        assertThat(CommentComposerText.bounded(over)).hasLength(ComposerMode.COMMENT.maxLength!!)
        assertThat(CommentComposerText.bounded("salut")).isEqualTo("salut")
    }

    @Test
    fun `a blank comment or one already leaving cannot be sent`() {
        assertThat(CommentComposerText.canSend(text = "  \n ", isSending = false)).isFalse()
        assertThat(CommentComposerText.canSend(text = "Top", isSending = true)).isFalse()
        assertThat(CommentComposerText.canSend(text = "Top", isSending = false)).isTrue()
    }

    @Test
    fun `an attachment alone is enough to send`() {
        assertThat(CommentComposerText.canSend(text = "", isSending = false, hasAttachment = true)).isTrue()
    }
}
