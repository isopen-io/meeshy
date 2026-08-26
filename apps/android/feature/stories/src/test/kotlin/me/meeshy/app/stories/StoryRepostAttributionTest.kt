package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryItem
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure repost-attribution resolver — the locked
 * "repost icon + @handle" the story viewer header shows after the author's name.
 * A non-null result means the story IS a repost (the icon shows); [handle] non-null
 * means the `@handle` text shows too. Ports iOS `StoryViewerView+Sidebar` gating:
 * icon on `repostOfId != nil`, handle on `repostAuthorUsername ?? repostAuthorName`.
 * No Android, no Compose, no I/O.
 */
@RunWith(JUnit4::class)
class StoryRepostAttributionTest {

    // --- not a repost → no attribution at all ---

    @Test
    fun `a story with no repost id is not a repost`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = null,
            repostAuthorUsername = "alice",
            repostAuthorName = "Alice",
        )
        assertThat(result).isNull()
    }

    @Test
    fun `an empty repost id is not a repost`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = "",
            repostAuthorUsername = "alice",
            repostAuthorName = "Alice",
        )
        assertThat(result).isNull()
    }

    @Test
    fun `a blank whitespace repost id is not a repost`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = "   ",
            repostAuthorUsername = "alice",
            repostAuthorName = "Alice",
        )
        assertThat(result).isNull()
    }

    // --- a repost → icon shows; handle prefers username ---

    @Test
    fun `a repost prefers the username handle over the name`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = "post123",
            repostAuthorUsername = "alice",
            repostAuthorName = "Alice Wonderland",
        )
        assertThat(result).isEqualTo(StoryRepostAttribution(handle = "alice"))
    }

    @Test
    fun `a repost falls back to the name when the username is absent`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = "post123",
            repostAuthorUsername = null,
            repostAuthorName = "Alice",
        )
        assertThat(result).isEqualTo(StoryRepostAttribution(handle = "Alice"))
    }

    @Test
    fun `a repost falls back to the name when the username is blank`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = "post123",
            repostAuthorUsername = "   ",
            repostAuthorName = "Alice",
        )
        assertThat(result).isEqualTo(StoryRepostAttribution(handle = "Alice"))
    }

    @Test
    fun `a repost trims surrounding whitespace from the resolved handle`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = "post123",
            repostAuthorUsername = "  alice  ",
            repostAuthorName = null,
        )
        assertThat(result).isEqualTo(StoryRepostAttribution(handle = "alice"))
    }

    // --- a repost with no attributable handle → icon only ---

    @Test
    fun `a repost with no handle at all still marks a repost with a null handle`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = "post123",
            repostAuthorUsername = null,
            repostAuthorName = null,
        )
        assertThat(result).isNotNull()
        assertThat(result!!.handle).isNull()
    }

    @Test
    fun `a repost whose only handle fields are blank marks a repost with a null handle`() {
        val result = StoryRepostAttribution.resolve(
            repostOfId = "post123",
            repostAuthorUsername = "  ",
            repostAuthorName = "",
        )
        assertThat(result).isNotNull()
        assertThat(result!!.handle).isNull()
    }

    // --- StoryItem overload wiring ---

    @Test
    fun `the StoryItem overload reads the repost fields off the item`() {
        val item = StoryItem(
            id = "story1",
            repostOfId = "post123",
            repostAuthorUsername = "bob",
            repostAuthorName = "Robert",
        )
        assertThat(StoryRepostAttribution.resolve(item))
            .isEqualTo(StoryRepostAttribution(handle = "bob"))
    }

    @Test
    fun `the StoryItem overload returns null for a non-repost item`() {
        val item = StoryItem(id = "story1", repostAuthorName = "Robert")
        assertThat(StoryRepostAttribution.resolve(item)).isNull()
    }
}
