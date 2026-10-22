package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Guards the emoji picker catalog — the port of iOS `EmojiGridCategory` must keep
 * its ten tabs in order, with content in each, and no repeated emoji inside a tab
 * (the grid keys its cells by emoji, so a repeat would crash the lazy grid).
 */
class EmojiCatalogTest {

    @Test
    fun `ten categories in the iOS tab order`() {
        assertThat(EmojiCatalog.categories.map { it.id })
            .containsExactly(
                EmojiCategoryId.RECENT,
                EmojiCategoryId.SMILEYS,
                EmojiCategoryId.PEOPLE,
                EmojiCategoryId.ANIMALS,
                EmojiCategoryId.FOOD,
                EmojiCategoryId.ACTIVITIES,
                EmojiCategoryId.TRAVEL,
                EmojiCategoryId.OBJECTS,
                EmojiCategoryId.SYMBOLS,
                EmojiCategoryId.FLAGS,
            )
            .inOrder()
    }

    @Test
    fun `the recent tab carries no fixed content and the nine others carry plenty`() {
        val byId = EmojiCatalog.categories.associateBy { it.id }
        assertThat(byId.getValue(EmojiCategoryId.RECENT).emojis).isEmpty()
        EmojiCatalog.searchableCategories.forEach { category ->
            assertThat(category.emojis.size).isAtLeast(60)
        }
    }

    @Test
    fun `no emoji is repeated inside a category`() {
        EmojiCatalog.categories.forEach { category ->
            assertThat(category.emojis.toSet()).hasSize(category.emojis.size)
        }
    }

    @Test
    fun `category keys are unique and round-trip`() {
        val keys = EmojiCategoryId.entries.map { it.key }
        assertThat(keys.toSet()).hasSize(keys.size)
        EmojiCategoryId.entries.forEach { id ->
            assertThat(EmojiCategoryId.fromKey(id.key)).isEqualTo(id)
        }
        assertThat(EmojiCategoryId.fromKey("nope")).isNull()
        assertThat(EmojiCategoryId.fromKey(null)).isNull()
    }

    @Test
    fun `searchable categories are the catalog without the recent tab`() {
        assertThat(EmojiCatalog.searchableCategories.map { it.id })
            .containsExactlyElementsIn(EmojiCategoryId.entries - EmojiCategoryId.RECENT)
            .inOrder()
    }

    @Test
    fun `default quick reactions are the iOS strip`() {
        assertThat(EmojiCatalog.defaultQuickReactions)
            .containsExactly("❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "👍")
            .inOrder()
    }

    @Test
    fun `every default quick reaction can be found in the grid`() {
        val gridEmojis = EmojiCatalog.searchableCategories.flatMap { it.emojis }.toSet()
        assertThat(gridEmojis).containsAtLeastElementsIn(EmojiCatalog.defaultQuickReactions)
    }

    @Test
    fun `emojis of a category are served by id`() {
        assertThat(EmojiCatalog.emojis(EmojiCategoryId.FLAGS)).contains("🇫🇷")
        assertThat(EmojiCatalog.emojis(EmojiCategoryId.RECENT)).isEmpty()
    }
}
