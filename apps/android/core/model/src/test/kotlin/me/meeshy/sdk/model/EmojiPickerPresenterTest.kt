package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EmojiPickerPresenterTest {

    private val snapshot = EmojiCatalogSnapshot.build()
    private val quick = listOf("❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "👍")

    private fun page(
        query: String = "",
        selected: EmojiCategoryId = EmojiCategoryId.SMILEYS,
        recents: List<String> = emptyList(),
        quickReactions: List<String> = quick,
    ): EmojiPickerPage = EmojiPickerPresenter.page(
        query = query,
        selected = selected,
        snapshot = snapshot,
        quickReactions = quickReactions,
        recents = recents,
    )

    @Test
    fun `the recent tab leads with the quick reactions then the usage history`() {
        val page = page(selected = EmojiCategoryId.RECENT, recents = listOf("🎉", "🍕"))
        assertThat(page).isEqualTo(EmojiPickerPage.Recents(quickReactions = quick, recents = listOf("🎉", "🍕")))
    }

    @Test
    fun `the recent tab is cleanly empty of history until something was used`() {
        val page = page(selected = EmojiCategoryId.RECENT) as EmojiPickerPage.Recents
        assertThat(page.recents).isEmpty()
        assertThat(page.quickReactions).isNotEmpty()
    }

    @Test
    fun `quick reactions are capped at nine and the history at twenty`() {
        val many = (1..30).map { "q$it" }
        val page = page(selected = EmojiCategoryId.RECENT, recents = many, quickReactions = many) as EmojiPickerPage.Recents
        assertThat(page.quickReactions).hasSize(EmojiPickerPresenter.QUICK_REACTIONS_COUNT)
        assertThat(page.recents).hasSize(EmojiUsageRanker.HISTORY_CAPACITY)
    }

    @Test
    fun `a repeated emoji from the host or a damaged history is shown once`() {
        val page = page(
            selected = EmojiCategoryId.RECENT,
            recents = listOf("🎉", "🍕", "🎉"),
            quickReactions = listOf("❤️", "❤️", "😂"),
        ) as EmojiPickerPage.Recents
        assertThat(page.recents).containsExactly("🎉", "🍕").inOrder()
        assertThat(page.quickReactions).containsExactly("❤️", "😂").inOrder()
    }

    @Test
    fun `a category tab shows its emojis`() {
        val page = page(selected = EmojiCategoryId.FLAGS)
        assertThat(page).isEqualTo(EmojiPickerPage.Category(EmojiCategoryId.FLAGS, EmojiCatalog.emojis(EmojiCategoryId.FLAGS)))
    }

    @Test
    fun `a query replaces the selected tab with matching emojis`() {
        val page = page(query = "heart", selected = EmojiCategoryId.FLAGS)
        assertThat(page).isInstanceOf(EmojiPickerPage.Search::class.java)
        assertThat((page as EmojiPickerPage.Search).results).contains("❤️")
    }

    @Test
    fun `a query with no match is a drawn empty state, not a blank grid`() {
        assertThat(page(query = "zzzzqqqq")).isEqualTo(EmojiPickerPage.NoResults)
    }

    @Test
    fun `a whitespace-only query is not a search`() {
        assertThat(page(query = "   ", selected = EmojiCategoryId.FOOD))
            .isEqualTo(EmojiPickerPage.Category(EmojiCategoryId.FOOD, EmojiCatalog.emojis(EmojiCategoryId.FOOD)))
    }

    @Test
    fun `the tab strip is hidden while searching`() {
        assertThat(EmojiPickerPresenter.showsTabs(query = "")).isTrue()
        assertThat(EmojiPickerPresenter.showsTabs(query = "  ")).isTrue()
        assertThat(EmojiPickerPresenter.showsTabs(query = "a")).isFalse()
    }

    @Test
    fun `the snapshot holds the ten categories and an index over the same catalog`() {
        assertThat(snapshot.categories).hasSize(10)
        assertThat(snapshot.index.search("heart")).isNotEmpty()
    }
}
