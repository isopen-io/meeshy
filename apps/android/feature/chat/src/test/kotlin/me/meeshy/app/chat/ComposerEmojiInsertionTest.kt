package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerEmojiInsertionTest {

    @Test
    fun `collapsed cursor inserts the emoji at that position and leaves the rest untouched`() {
        val result = ComposerEmojiInsertion.insert(text = "Hello world", selectionStart = 5, selectionEnd = 5, emoji = "😀")

        assertThat(result.text).isEqualTo("Hello😀 world")
        assertThat(result.cursor).isEqualTo(5 + "😀".length)
    }

    @Test
    fun `a non-collapsed selection is replaced by the emoji, never merely appended`() {
        val result = ComposerEmojiInsertion.insert(text = "Hello world", selectionStart = 6, selectionEnd = 11, emoji = "🌍")

        assertThat(result.text).isEqualTo("Hello 🌍")
        assertThat(result.cursor).isEqualTo(6 + "🌍".length)
    }

    @Test
    fun `a reversed selection (end before start) is normalised the same as a forward one`() {
        val forward = ComposerEmojiInsertion.insert(text = "Hello world", selectionStart = 6, selectionEnd = 11, emoji = "🌍")
        val reversed = ComposerEmojiInsertion.insert(text = "Hello world", selectionStart = 11, selectionEnd = 6, emoji = "🌍")

        assertThat(reversed).isEqualTo(forward)
    }

    @Test
    fun `cursor at the very start prepends the emoji`() {
        val result = ComposerEmojiInsertion.insert(text = "world", selectionStart = 0, selectionEnd = 0, emoji = "🎉")

        assertThat(result.text).isEqualTo("🎉world")
        assertThat(result.cursor).isEqualTo("🎉".length)
    }

    @Test
    fun `cursor at the very end appends the emoji`() {
        val result = ComposerEmojiInsertion.insert(text = "world", selectionStart = 5, selectionEnd = 5, emoji = "🎉")

        assertThat(result.text).isEqualTo("world🎉")
        assertThat(result.cursor).isEqualTo(5 + "🎉".length)
    }

    @Test
    fun `insertion into an empty draft yields exactly the emoji`() {
        val result = ComposerEmojiInsertion.insert(text = "", selectionStart = 0, selectionEnd = 0, emoji = "👍")

        assertThat(result.text).isEqualTo("👍")
        assertThat(result.cursor).isEqualTo("👍".length)
    }

    @Test
    fun `a stale out-of-range offset is coerced instead of throwing`() {
        val result = ComposerEmojiInsertion.insert(text = "hi", selectionStart = 999, selectionEnd = 999, emoji = "🙂")

        assertThat(result.text).isEqualTo("hi🙂")
        assertThat(result.cursor).isEqualTo(2 + "🙂".length)
    }

    @Test
    fun `a negative offset is coerced to the start of the text`() {
        val result = ComposerEmojiInsertion.insert(text = "hi", selectionStart = -3, selectionEnd = -3, emoji = "🙂")

        assertThat(result.text).isEqualTo("🙂hi")
        assertThat(result.cursor).isEqualTo("🙂".length)
    }

    @Test
    fun `chaining two emoji from the same panel inserts them side by side, never nested`() {
        val first = ComposerEmojiInsertion.insert(text = "hi", selectionStart = 2, selectionEnd = 2, emoji = "🙂")
        val second = ComposerEmojiInsertion.insert(text = first.text, selectionStart = first.cursor, selectionEnd = first.cursor, emoji = "🎉")

        assertThat(second.text).isEqualTo("hi🙂🎉")
    }
}
