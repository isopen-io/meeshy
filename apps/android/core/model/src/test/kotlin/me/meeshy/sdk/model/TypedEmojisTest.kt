package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Mirrors iOS `RecentEmojiHistory.emojis(in:)`: the emojis of a sent text feed the recents. */
class TypedEmojisTest {

    @Test
    fun `the emojis of a text are read in typing order`() {
        assertThat(TypedEmojis.extract("Bravo 🎉 et merci ❤️ !")).containsExactly("🎉", "❤️").inOrder()
    }

    @Test
    fun `a composed emoji stays one emoji`() {
        assertThat(TypedEmojis.extract("👍🏽 👨‍👩‍👧 🇫🇷")).containsExactly("👍🏽", "👨‍👩‍👧", "🇫🇷").inOrder()
    }

    @Test
    fun `digits, hash and plain text are not emojis`() {
        assertThat(TypedEmojis.extract("Rendez-vous #3 à 10h, ok ?")).isEmpty()
    }

    @Test
    fun `a repeated emoji is kept each time it was typed`() {
        assertThat(TypedEmojis.extract("😂😂")).containsExactly("😂", "😂")
    }
}
