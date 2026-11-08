package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryPlaybackSkipResolver.Outcome
import org.junit.Test

class StoryPlaybackSkipResolverTest {

    private fun live(id: String, viewed: Boolean = false) = StoryItem(id = id, content = "x", isViewed = viewed)
    private fun expired(id: String) = StoryItem(id = id, content = "x", expiresAt = "dead")
    private fun empty(id: String) = StoryItem(id = id)
    private fun group(id: String, vararg stories: StoryItem) = StoryGroup(id = id, stories = stories.toList())

    private val isExpired = { s: StoryItem -> s.expiresAt == "dead" }

    private fun resolve(groups: List<StoryGroup>, g: Int, s: Int, me: String? = "me") =
        StoryPlaybackSkipResolver.resolve(groups, g, s, me, isExpired)

    @Test
    fun `a playable position stays`() {
        assertThat(resolve(listOf(group("a", live("1"))), 0, 0)).isEqualTo(Outcome.Stay)
    }

    @Test
    fun `an expired or empty slide advances inside the group`() {
        val groups = listOf(group("a", expired("1"), empty("2"), live("3")))
        assertThat(resolve(groups, 0, 0)).isEqualTo(Outcome.AdvanceStory(2))
    }

    @Test
    fun `an exhausted group advances to the next group entry`() {
        val groups = listOf(
            group("a", live("1"), expired("2")),
            group("b", expired("3")),
            group("c", live("4", viewed = true), live("5")),
        )
        assertThat(resolve(groups, 0, 1)).isEqualTo(Outcome.AdvanceGroup(groupIndex = 2, storyIndex = 1))
    }

    @Test
    fun `nothing left anywhere closes`() {
        val groups = listOf(group("a", expired("1")), group("b", empty("2")))
        assertThat(resolve(groups, 0, 0)).isEqualTo(Outcome.Close)
    }

    @Test
    fun `the author revisits their own expired stories`() {
        assertThat(resolve(listOf(group("me", expired("1"))), 0, 0)).isEqualTo(Outcome.Stay)
    }

    @Test
    fun `an out of range group or an empty group stays`() {
        assertThat(resolve(emptyList(), 0, 0)).isEqualTo(Outcome.Stay)
        assertThat(resolve(listOf(group("a")), 0, 0)).isEqualTo(Outcome.Stay)
    }
}
