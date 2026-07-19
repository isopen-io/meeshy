package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.status.StatusPage
import org.junit.Test

class StatusBarListStateTest {

    private fun entry(id: String, userId: String = "u-$id", emoji: String = "😀") =
        StatusEntry(id = id, userId = userId, moodEmoji = emoji)

    private fun page(vararg entries: StatusEntry, nextCursor: String? = null, hasMore: Boolean = false) =
        StatusPage(statuses = entries.toList(), nextCursor = nextCursor, hasMore = hasMore)

    @Test
    fun `appended folds a page onto the empty list and marks it loaded`() {
        val state = StatusBarListState.Empty
            .appended(page(entry("a"), entry("b"), nextCursor = "c2", hasMore = true))

        assertThat(state.statuses.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(state.cursor).isEqualTo("c2")
        assertThat(state.hasMore).isTrue()
        assertThat(state.hasLoaded).isTrue()
    }

    @Test
    fun `appended de-duplicates a boundary status re-served on the next page`() {
        val state = StatusBarListState.Empty
            .appended(page(entry("a"), entry("b"), nextCursor = "c2", hasMore = true))
            .appended(page(entry("b"), entry("c"), hasMore = false))

        assertThat(state.statuses.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `an empty page still marks the list loaded`() {
        val state = StatusBarListState.Empty.appended(page(hasMore = false))

        assertThat(state.statuses).isEmpty()
        assertThat(state.hasLoaded).isTrue()
    }

    @Test
    fun `canLoadMore requires both hasMore and a cursor`() {
        assertThat(StatusBarListState(hasMore = true, cursor = "c").canLoadMore).isTrue()
        assertThat(StatusBarListState(hasMore = true, cursor = null).canLoadMore).isFalse()
        assertThat(StatusBarListState(hasMore = false, cursor = "c").canLoadMore).isFalse()
    }

    @Test
    fun `created hoists the new status to the front`() {
        val state = StatusBarListState.Empty
            .appended(page(entry("a"), entry("b")))
            .created(entry("z"))

        assertThat(state.statuses.map { it.id }).containsExactly("z", "a", "b").inOrder()
        assertThat(state.hasLoaded).isTrue()
    }

    @Test
    fun `created replaces an existing entry with the same id instead of doubling it`() {
        val state = StatusBarListState.Empty
            .appended(page(entry("a"), entry("b")))
            .created(entry("b", emoji = "🔥"))

        assertThat(state.statuses.map { it.id }).containsExactly("b", "a").inOrder()
        assertThat(state.statuses.first().moodEmoji).isEqualTo("🔥")
    }

    @Test
    fun `removed drops the matching status`() {
        val state = StatusBarListState.Empty
            .appended(page(entry("a"), entry("b"), entry("c")))
            .removed("b")

        assertThat(state.statuses.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `removed is inert for an id not present`() {
        val base = StatusBarListState.Empty.appended(page(entry("a")))

        assertThat(base.removed("zzz")).isSameInstanceAs(base)
    }

    @Test
    fun `reacted bumps the emoji count from an empty summary`() {
        val state = StatusBarListState.Empty
            .appended(page(entry("a")))
            .reacted("a", "❤️")

        assertThat(state.statuses.first().reactionSummary).containsExactly("❤️", 1)
    }

    @Test
    fun `reacted increments an existing emoji count`() {
        val seeded = StatusBarListState(
            statuses = listOf(StatusEntry(id = "a", userId = "u", reactionSummary = mapOf("❤️" to 2))),
        )

        val state = seeded.reacted("a", "❤️")

        assertThat(state.statuses.first().reactionSummary).containsExactly("❤️", 3)
    }

    @Test
    fun `reacted is inert for a status not in the list`() {
        val base = StatusBarListState.Empty.appended(page(entry("a")))

        assertThat(base.reacted("zzz", "❤️")).isEqualTo(base)
    }
}
