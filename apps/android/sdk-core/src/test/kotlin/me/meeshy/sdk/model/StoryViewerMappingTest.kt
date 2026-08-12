package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryViewerMappingTest {

    private fun wire(
        id: String = "u1",
        username: String = "alice",
        displayName: String? = null,
        avatarUrl: String? = null,
        viewedAt: String? = null,
        reaction: String? = null,
    ) = StoryViewerWire(id, username, displayName, avatarUrl, viewedAt, reaction)

    @Test
    fun toStoryViewer_keepsPresentDisplayName() {
        val viewer = wire(displayName = "Alice A.").toStoryViewer()

        assertThat(viewer.displayName).isEqualTo("Alice A.")
    }

    @Test
    fun toStoryViewer_fallsBackToUsername_whenDisplayNameNull() {
        val viewer = wire(username = "bob", displayName = null).toStoryViewer()

        assertThat(viewer.displayName).isEqualTo("bob")
    }

    @Test
    fun toStoryViewer_fallsBackToUsername_whenDisplayNameBlank() {
        val viewer = wire(username = "bob", displayName = "   ").toStoryViewer()

        assertThat(viewer.displayName).isEqualTo("bob")
    }

    @Test
    fun toStoryViewer_collapsesBlankReactionAndAvatarToNull() {
        val viewer = wire(reaction = " ", avatarUrl = "").toStoryViewer()

        assertThat(viewer.reactionEmoji).isNull()
        assertThat(viewer.avatarUrl).isNull()
    }

    @Test
    fun toStoryViewer_keepsReactionAvatarAndViewedAt_whenPresent() {
        val viewer = wire(
            avatarUrl = "https://cdn/a.png",
            viewedAt = "2026-06-17T10:00:00Z",
            reaction = "❤️",
        ).toStoryViewer()

        assertThat(viewer.avatarUrl).isEqualTo("https://cdn/a.png")
        assertThat(viewer.viewedAt).isEqualTo("2026-06-17T10:00:00Z")
        assertThat(viewer.reactionEmoji).isEqualTo("❤️")
    }

    @Test
    fun toStoryViewer_collapsesBlankViewedAtToNull() {
        assertThat(wire(viewedAt = "").toStoryViewer().viewedAt).isNull()
    }
}
