package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryViewerScopeTest {

    private fun group(id: String, vararg stories: String) =
        StoryGroup(id = id, stories = stories.map { StoryItem(id = it, content = "x", expiresAt = if (it.startsWith("old")) "dead" else null) })

    private val isExpired = { s: StoryItem -> s.expiresAt == "dead" }

    @Test
    fun `single group mode keeps only the opened author`() {
        val all = listOf(group("a", "a1"), group("b", "b1"), group("c", "c1"))
        val resolved = StoryViewerScope.resolve(all, resolvedIndex = 1, singleGroup = true)
        assertThat(resolved.groups.map { it.id }).containsExactly("b")
        assertThat(resolved.currentIndex).isEqualTo(0)
    }

    @Test
    fun `full navigation keeps every author and the index`() {
        val all = listOf(group("a", "a1"), group("b", "b1"))
        val resolved = StoryViewerScope.resolve(all, resolvedIndex = 1, singleGroup = false)
        assertThat(resolved.groups).hasSize(2)
        assertThat(resolved.currentIndex).isEqualTo(1)
    }

    @Test
    fun `an out of range index never yields an empty viewer`() {
        val all = listOf(group("a", "a1"), group("b", "b1"))
        val resolved = StoryViewerScope.resolve(all, resolvedIndex = 9, singleGroup = true)
        assertThat(resolved.groups).hasSize(2)
        assertThat(resolved.currentIndex).isEqualTo(0)
    }

    @Test
    fun `own archives leave the viewer except the targeted one`() {
        val all = listOf(group("me", "old1", "live1", "old2"), group("b", "old9"))
        val scoped = StoryViewerScope.liveOnly(all, authorId = "me", keeping = "old2", isExpired = isExpired)
        assertThat(scoped[0].stories.map { it.id }).containsExactly("live1", "old2").inOrder()
        assertThat(scoped[1].stories.map { it.id }).containsExactly("old9")
    }

    @Test
    fun `an author with nothing live keeps the whole group`() {
        val all = listOf(group("me", "old1", "old2"))
        val scoped = StoryViewerScope.liveOnly(all, authorId = "me", keeping = null, isExpired = isExpired)
        assertThat(scoped[0].stories).hasSize(2)
    }

    @Test
    fun `the story index follows identity into the filtered group`() {
        val original = group("me", "old1", "live1", "live2")
        val scoped = original.copy(stories = original.stories.drop(1))
        assertThat(StoryViewerScope.storyIndex(2, original, scoped)).isEqualTo(1)
        assertThat(StoryViewerScope.storyIndex(0, original, scoped)).isEqualTo(0)
        assertThat(StoryViewerScope.storyIndex(9, original, scoped)).isEqualTo(0)
    }
}
