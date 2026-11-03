package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryIndexResolverTest {

    private fun group(vararg ids: String) = StoryGroup(id = "a", stories = ids.map { StoryItem(id = it, content = "x") })

    @Test
    fun `a known postId resolves to its index in reading order`() {
        assertThat(StoryIndexResolver.index("s2", group("s1", "s2", "s3"), fallback = 0)).isEqualTo(1)
        assertThat(StoryIndexResolver.index("s1", group("s1", "s2"), fallback = 5)).isEqualTo(0)
    }

    @Test
    fun `a missing or null postId falls back`() {
        assertThat(StoryIndexResolver.index(null, group("s1"), fallback = 3)).isEqualTo(3)
        assertThat(StoryIndexResolver.index("zz", group("s1"), fallback = 2)).isEqualTo(2)
    }

    @Test
    fun `entry is the first unviewed playable story else the first playable`() {
        val g = StoryGroup(
            id = "a",
            stories = listOf(
                StoryItem(id = "s1", content = "x", isViewed = true),
                StoryItem(id = "s2", content = "x", isViewed = false, expiresAt = "dead"),
                StoryItem(id = "s3", content = "x", isViewed = false),
            ),
        )
        assertThat(StoryIndexResolver.entryIndex(g) { it.expiresAt == "dead" }).isEqualTo(2)
        val allViewed = g.copy(stories = g.stories.map { it.copy(isViewed = true) })
        assertThat(StoryIndexResolver.entryIndex(allViewed) { it.expiresAt == "dead" }).isEqualTo(0)
        assertThat(StoryIndexResolver.entryIndex(g) { true }).isNull()
    }
}
