package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [UserCategoryCatalog] — the ordering-and-mutation SSOT
 * for the user's conversation-category corpus, a faithful port of iOS
 * `UserCategoryStore`'s `sortedSnapshot()` ordering and its
 * `create`/`update`/`delete`/`reorder`/`applyRemote` mutations
 * (`packages/MeeshySDK/Sources/MeeshySDK/Store/UserCategoryStore.swift`).
 * Expectations are hand-written literals, never derived from the code under test.
 */
class UserCategoryCatalogTest {

    private fun cat(id: String, name: String, order: Int? = null) =
        CategoryOption(id = id, name = name, order = order)

    // --- of / EMPTY ----------------------------------------------------------

    @Test
    fun `EMPTY holds no categories`() {
        assertThat(UserCategoryCatalog.EMPTY.sorted).isEmpty()
        assertThat(UserCategoryCatalog.EMPTY.isEmpty).isTrue()
    }

    @Test
    fun `of a non-empty snapshot is not empty`() {
        assertThat(UserCategoryCatalog.of(listOf(cat("a", "Work"))).isEmpty).isFalse()
    }

    @Test
    fun `of collapses duplicate ids keeping the last`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("a", "First", order = 1), cat("a", "Second", order = 2)),
        )
        assertThat(catalog.sorted).containsExactly(cat("a", "Second", order = 2))
    }

    // --- sorted: ordering ----------------------------------------------------

    @Test
    fun `sorted orders by ascending order`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("b", "Work", order = 2), cat("a", "Family", order = 1), cat("c", "Play", order = 3)),
        )
        assertThat(catalog.sorted.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `sorted places a null-order row last`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("none", "Zeta"), cat("b", "Work", order = 2), cat("a", "Family", order = 1)),
        )
        assertThat(catalog.sorted.map { it.id }).containsExactly("a", "b", "none").inOrder()
    }

    @Test
    fun `sorted tie-breaks equal orders by case-insensitive name`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("z", "zebra", order = 1), cat("a", "Apple", order = 1)),
        )
        assertThat(catalog.sorted.map { it.id }).containsExactly("a", "z").inOrder()
    }

    @Test
    fun `sorted tie-breaks equal null orders by name`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("w", "Work"), cat("f", "Family")),
        )
        assertThat(catalog.sorted.map { it.id }).containsExactly("f", "w").inOrder()
    }

    // --- upsert --------------------------------------------------------------

    @Test
    fun `upsert adds a new category`() {
        val catalog = UserCategoryCatalog.of(listOf(cat("a", "Family", order = 1)))
            .upsert(cat("b", "Work", order = 2))
        assertThat(catalog.sorted.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `upsert replaces an existing id in place`() {
        val catalog = UserCategoryCatalog.of(listOf(cat("a", "Family", order = 1)))
            .upsert(cat("a", "Familia", order = 5))
        assertThat(catalog.sorted).containsExactly(cat("a", "Familia", order = 5))
    }

    @Test
    fun `upsert leaves the receiver unchanged`() {
        val original = UserCategoryCatalog.of(listOf(cat("a", "Family", order = 1)))
        original.upsert(cat("b", "Work", order = 2))
        assertThat(original.sorted.map { it.id }).containsExactly("a")
    }

    // --- remove --------------------------------------------------------------

    @Test
    fun `remove drops a known category`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("a", "Family", order = 1), cat("b", "Work", order = 2)),
        ).remove("a")
        assertThat(catalog.sorted.map { it.id }).containsExactly("b")
    }

    @Test
    fun `remove of an unknown id returns the same catalog`() {
        val original = UserCategoryCatalog.of(listOf(cat("a", "Family", order = 1)))
        assertThat(original.remove("ghost")).isSameInstanceAs(original)
    }

    // --- reorder -------------------------------------------------------------

    @Test
    fun `reorder patches the order of a known id and re-sorts`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("a", "Family", order = 1), cat("b", "Work", order = 2)),
        ).reorder(mapOf("b" to 0))
        assertThat(catalog.sorted.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `reorder ignores unknown ids`() {
        val catalog = UserCategoryCatalog.of(listOf(cat("a", "Family", order = 1)))
            .reorder(mapOf("ghost" to 0))
        assertThat(catalog.sorted).containsExactly(cat("a", "Family", order = 1))
    }

    @Test
    fun `reorder patches only the matching rows in a mixed batch`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("a", "Family", order = 1), cat("b", "Work", order = 2)),
        ).reorder(mapOf("b" to 0, "ghost" to 9))
        assertThat(catalog.sorted).containsExactly(
            cat("b", "Work", order = 0),
            cat("a", "Family", order = 1),
        ).inOrder()
    }

    @Test
    fun `reorder with an empty map returns the same catalog`() {
        val original = UserCategoryCatalog.of(listOf(cat("a", "Family", order = 1)))
        assertThat(original.reorder(emptyMap())).isSameInstanceAs(original)
    }

    // --- apply (event dispatch) ---------------------------------------------

    @Test
    fun `apply Upserted upserts the category`() {
        val catalog = UserCategoryCatalog.EMPTY
            .apply(CategoryEvent.Upserted(cat("a", "Family", order = 1)))
        assertThat(catalog.sorted).containsExactly(cat("a", "Family", order = 1))
    }

    @Test
    fun `apply Deleted drops the category`() {
        val catalog = UserCategoryCatalog.of(listOf(cat("a", "Family", order = 1)))
            .apply(CategoryEvent.Deleted("a"))
        assertThat(catalog.sorted).isEmpty()
    }

    @Test
    fun `apply Reordered patches the orders`() {
        val catalog = UserCategoryCatalog.of(
            listOf(cat("a", "Family", order = 1), cat("b", "Work", order = 2)),
        ).apply(CategoryEvent.Reordered(mapOf("b" to 0)))
        assertThat(catalog.sorted.map { it.id }).containsExactly("b", "a").inOrder()
    }
}
