package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #18930 — the realtime mood deltas, folded as iOS `StatusViewModel.subscribeToSocketEvents` does. */
class StatusEntryFoldTest {

    private fun mood(id: String, userId: String = "u-$id", emoji: String = "🙂") = StatusEntry(id = id, userId = userId, moodEmoji = emoji)

    private val bar = listOf(mood("a"), mood("b"))

    @Test
    fun `a created mood joins the front`() {
        assertThat(StatusEntryFold.onCreated(bar, mood("n")).map { it.id }).containsExactly("n", "a", "b").inOrder()
    }

    @Test
    fun `a created mood already held changes nothing, the same list kept`() {
        assertThat(StatusEntryFold.onCreated(bar, mood("a", emoji = "🔥"))).isSameInstanceAs(bar)
    }

    @Test
    fun `an updated mood replaces its entry in place`() {
        val folded = StatusEntryFold.onUpdated(bar, mood("b", emoji = "🔥"))

        assertThat(folded.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(folded.last().moodEmoji).isEqualTo("🔥")
    }

    @Test
    fun `an update for a mood not held smuggles nothing in`() {
        assertThat(StatusEntryFold.onUpdated(bar, mood("z"))).isSameInstanceAs(bar)
    }

    @Test
    fun `a deleted mood leaves`() {
        assertThat(StatusEntryFold.onDeleted(bar, "a").map { it.id }).containsExactly("b")
    }

    @Test
    fun `a deletion of a mood not held changes nothing`() {
        assertThat(StatusEntryFold.onDeleted(bar, "z")).isSameInstanceAs(bar)
    }
}
