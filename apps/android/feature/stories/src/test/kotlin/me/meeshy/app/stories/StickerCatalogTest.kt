package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure sticker catalogue + search and the picker-state reducer.
 * No Android, no I/O — drives the public API and asserts the visible-emoji decision so the
 * composer's picker dialog stays glue.
 */
@RunWith(JUnit4::class)
class StickerCatalogTest {

    // --- catalogue shape ---

    @Test
    fun `every category is non-empty`() {
        StickerCategory.values().forEach { category ->
            assertThat(StickerCatalog.inCategory(category)).isNotEmpty()
        }
    }

    @Test
    fun `inCategory returns only that category's emojis in catalogue order`() {
        val animals = StickerCatalog.inCategory(StickerCategory.ANIMALS)
        assertThat(animals).contains("🐱")
        assertThat(animals).contains("🐶")
        assertThat(animals).doesNotContain("🍕")
        val firstTwo = StickerCatalog.entries
            .filter { it.category == StickerCategory.ANIMALS }
            .take(2)
            .map { it.emoji }
        assertThat(animals.take(2)).isEqualTo(firstTwo)
    }

    @Test
    fun `all is the concatenation of every category and is duplicate-free`() {
        val expectedSize = StickerCategory.values().sumOf { StickerCatalog.inCategory(it).size }
        assertThat(StickerCatalog.all).hasSize(expectedSize)
        assertThat(StickerCatalog.all).containsNoDuplicates()
    }

    @Test
    fun `all preserves category tab order`() {
        val smileys = StickerCatalog.inCategory(StickerCategory.SMILEYS)
        val flags = StickerCatalog.inCategory(StickerCategory.FLAGS)
        assertThat(StickerCatalog.all.first()).isEqualTo(smileys.first())
        assertThat(StickerCatalog.all.last()).isEqualTo(flags.last())
    }

    // --- search: blank query is not a search ---

    @Test
    fun `a blank query returns the whole scope unfiltered`() {
        assertThat(StickerCatalog.search("")).isEqualTo(StickerCatalog.all)
        assertThat(StickerCatalog.search("   ")).isEqualTo(StickerCatalog.all)
    }

    @Test
    fun `a blank query scoped to a category returns that category unfiltered`() {
        assertThat(StickerCatalog.search("", StickerCategory.FOOD))
            .isEqualTo(StickerCatalog.inCategory(StickerCategory.FOOD))
    }

    // --- search: keyword matching ---

    @Test
    fun `search matches an emoji by keyword`() {
        assertThat(StickerCatalog.search("cat")).contains("🐱")
        assertThat(StickerCatalog.search("pizza")).contains("🍕")
    }

    @Test
    fun `search is case-insensitive and trims surrounding whitespace`() {
        assertThat(StickerCatalog.search("  CAT ")).contains("🐱")
    }

    @Test
    fun `search matches a keyword substring`() {
        // "foot" is a substring of the "football" keyword on the soccer ball.
        assertThat(StickerCatalog.search("foot")).contains("⚽")
    }

    @Test
    fun `search spans every category by default`() {
        // "love" tags emojis in both SMILEYS (😍) and SYMBOLS (❤️).
        val love = StickerCatalog.search("love")
        assertThat(love).contains("😍")
        assertThat(love).contains("❤️")
    }

    @Test
    fun `search scoped to a category excludes matches from other categories`() {
        val loveInSymbols = StickerCatalog.search("love", StickerCategory.SYMBOLS)
        assertThat(loveInSymbols).contains("❤️")
        assertThat(loveInSymbols).doesNotContain("😍")
    }

    @Test
    fun `search matches the glyph itself`() {
        assertThat(StickerCatalog.search("🍕")).containsExactly("🍕")
    }

    @Test
    fun `search with no match returns empty`() {
        assertThat(StickerCatalog.search("zzzznotanemoji")).isEmpty()
    }

    @Test
    fun `search preserves catalogue order and is duplicate-free`() {
        val balls = StickerCatalog.search("ball")
        assertThat(balls).containsNoDuplicates()
        val orderInAll = balls.map { StickerCatalog.all.indexOf(it) }
        assertThat(orderInAll).isInOrder()
    }

    // --- picker state reducer ---

    @Test
    fun `the default picker shows the smileys tab and is not searching`() {
        val state = StickerPickerState()
        assertThat(state.category).isEqualTo(StickerCategory.SMILEYS)
        assertThat(state.isSearching).isFalse()
        assertThat(state.visibleEmojis).isEqualTo(StickerCatalog.inCategory(StickerCategory.SMILEYS))
    }

    @Test
    fun `selecting a tab shows that tab's emojis while not searching`() {
        val state = StickerPickerState().withCategory(StickerCategory.ANIMALS)
        assertThat(state.category).isEqualTo(StickerCategory.ANIMALS)
        assertThat(state.visibleEmojis).isEqualTo(StickerCatalog.inCategory(StickerCategory.ANIMALS))
    }

    @Test
    fun `a whitespace query is not treated as searching`() {
        val state = StickerPickerState(query = "   ")
        assertThat(state.isSearching).isFalse()
        assertThat(state.visibleEmojis).isEqualTo(StickerCatalog.inCategory(StickerCategory.SMILEYS))
    }

    @Test
    fun `a query searches across all categories ignoring the active tab`() {
        // Active tab is ANIMALS but the query targets a SYMBOLS emoji — it must still surface.
        val state = StickerPickerState(category = StickerCategory.ANIMALS).withQuery("heart")
        assertThat(state.isSearching).isTrue()
        assertThat(state.visibleEmojis).contains("❤️")
        assertThat(state.visibleEmojis).isEqualTo(StickerCatalog.search("heart"))
    }

    @Test
    fun `clearing the query returns to the active tab`() {
        val state = StickerPickerState(category = StickerCategory.FOOD)
            .withQuery("pizza")
            .withQuery("")
        assertThat(state.isSearching).isFalse()
        assertThat(state.visibleEmojis).isEqualTo(StickerCatalog.inCategory(StickerCategory.FOOD))
    }

    @Test
    fun `withCategory is inert on the already-selected tab`() {
        val state = StickerPickerState(category = StickerCategory.TRAVEL)
        assertThat(state.withCategory(StickerCategory.TRAVEL)).isSameInstanceAs(state)
    }

    @Test
    fun `withQuery is inert on unchanged text`() {
        val state = StickerPickerState(query = "dog")
        assertThat(state.withQuery("dog")).isSameInstanceAs(state)
    }

    @Test
    fun `selecting a tab while searching keeps the global search result`() {
        val state = StickerPickerState().withQuery("flag").withCategory(StickerCategory.FLAGS)
        assertThat(state.isSearching).isTrue()
        assertThat(state.visibleEmojis).isEqualTo(StickerCatalog.search("flag"))
    }
}
