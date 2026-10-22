package me.meeshy.sdk.model

/** What the picker body draws for the current query and tab. */
sealed interface EmojiPickerPage {
    /**
     * The recent tab: quick reactions first, then what the user used lately (possibly nothing
     * yet). Each list is de-duplicated — the grid keys its cells by emoji, and a repeat from a
     * host or a damaged history must not crash it.
     */
    data class Recents(val quickReactions: List<String>, val recents: List<String>) : EmojiPickerPage

    /** A fixed-content tab. */
    data class Category(val id: EmojiCategoryId, val emojis: List<String>) : EmojiPickerPage

    /** A search with at least one hit. */
    data class Search(val results: List<String>) : EmojiPickerPage

    /** A search that matched nothing — drawn as an empty state, never a blank grid. */
    data object NoResults : EmojiPickerPage
}

/**
 * The catalog and its search index, assembled together so a loader hands the UI one
 * immutable value — built off the main thread, read from it afterwards.
 */
data class EmojiCatalogSnapshot(
    val categories: List<EmojiCategory>,
    val index: EmojiSearchIndex,
) {
    companion object {
        fun build(): EmojiCatalogSnapshot = EmojiCatalogSnapshot(
            categories = EmojiCatalog.categories,
            index = EmojiSearchIndex.build(),
        )
    }
}

/**
 * Which page of the picker to draw — pure, so the one picker body serves the composer
 * field, the direct-send quick emoji and the reaction choice with a single set of rules
 * (iOS `EmojiPickerView.emojisToDisplay`).
 */
object EmojiPickerPresenter {

    /** iOS shows the first nine quick reactions on the recent tab. */
    const val QUICK_REACTIONS_COUNT: Int = 9

    fun showsTabs(query: String): Boolean = query.isBlank()

    fun page(
        query: String,
        selected: EmojiCategoryId,
        snapshot: EmojiCatalogSnapshot,
        quickReactions: List<String>,
        recents: List<String>,
    ): EmojiPickerPage {
        if (query.isNotBlank()) {
            val results = snapshot.index.search(query)
            return if (results.isEmpty()) EmojiPickerPage.NoResults else EmojiPickerPage.Search(results)
        }
        if (selected == EmojiCategoryId.RECENT) {
            return EmojiPickerPage.Recents(
                quickReactions = quickReactions.distinct().take(QUICK_REACTIONS_COUNT),
                recents = recents.distinct().take(EmojiUsageRanker.HISTORY_CAPACITY),
            )
        }
        val emojis = snapshot.categories.firstOrNull { it.id == selected }?.emojis.orEmpty()
        return EmojiPickerPage.Category(id = selected, emojis = emojis)
    }
}
