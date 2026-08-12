package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Guards the emoji picker catalog against accidental omission — the port of
 * iOS `EmojiCategory.all` must keep its six categories and non-empty content.
 */
class EmojiCatalogTest {

    @Test
    fun `category order matches iOS`() {
        assertThat(EmojiCatalog.categories.map { it.id })
            .containsExactly("reactions", "faces", "gestures", "hearts", "animals", "objects")
            .inOrder()
    }

    @Test
    fun `every category has an icon and at least eight emojis`() {
        EmojiCatalog.categories.forEach { category ->
            assertThat(category.icon).isNotEmpty()
            assertThat(category.emojis.size).isAtLeast(8)
        }
    }

    @Test
    fun `category ids are unique`() {
        val ids = EmojiCatalog.categories.map { it.id }
        assertThat(ids.toSet()).hasSize(ids.size)
    }

    @Test
    fun `default quick reactions are the iOS strip`() {
        assertThat(EmojiCatalog.defaultQuickReactions)
            .containsExactly("❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "👍")
            .inOrder()
    }
}
