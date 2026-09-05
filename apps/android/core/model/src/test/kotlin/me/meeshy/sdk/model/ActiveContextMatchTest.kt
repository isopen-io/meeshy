package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The shared "is this content the very thing the reader has on screen?" predicate (feature-parity
 * §M) — behind both silencing a fresh notification for the open thread ([NotificationToastPolicy])
 * and pulling down a banner already shown when the reader opens its thread
 * (`NotificationBannerViewModel.setActiveContext`). A port of iOS `NotificationToastManager`'s
 * `onConversationOpened` / `onPostOpened` + `handleNewNotification` guard: a match requires the
 * active id to be present AND equal — a null active id (nothing on screen) never matches, so a
 * null-vs-null pair is deliberately NOT a match.
 */
class ActiveContextMatchTest {

    @Test
    fun `same non-null conversation matches`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = "c1",
                contentPostId = null,
                activeConversationId = "c1",
                activePostId = null,
            )
        ).isTrue()
    }

    @Test
    fun `different conversation does not match`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = "c1",
                contentPostId = null,
                activeConversationId = "c2",
                activePostId = null,
            )
        ).isFalse()
    }

    @Test
    fun `same non-null post matches`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = null,
                contentPostId = "p1",
                activeConversationId = null,
                activePostId = "p1",
            )
        ).isTrue()
    }

    @Test
    fun `different post does not match`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = null,
                contentPostId = "p1",
                activeConversationId = null,
                activePostId = "p2",
            )
        ).isFalse()
    }

    @Test
    fun `a post match wins even when the conversation differs`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = "c1",
                contentPostId = "p1",
                activeConversationId = "c2",
                activePostId = "p1",
            )
        ).isTrue()
    }

    @Test
    fun `a conversation match wins even when the post differs`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = "c1",
                contentPostId = "p1",
                activeConversationId = "c1",
                activePostId = "p2",
            )
        ).isTrue()
    }

    @Test
    fun `a null active conversation never matches a present content conversation`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = "c1",
                contentPostId = null,
                activeConversationId = null,
                activePostId = null,
            )
        ).isFalse()
    }

    @Test
    fun `a null content conversation never matches a present active conversation`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = null,
                contentPostId = null,
                activeConversationId = "c1",
                activePostId = null,
            )
        ).isFalse()
    }

    @Test
    fun `a null active post never matches a present content post`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = null,
                contentPostId = "p1",
                activeConversationId = null,
                activePostId = null,
            )
        ).isFalse()
    }

    @Test
    fun `all null is not a match`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = null,
                contentPostId = null,
                activeConversationId = null,
                activePostId = null,
            )
        ).isFalse()
    }

    @Test
    fun `neither conversation nor post matches yields false`() {
        assertThat(
            ActiveContextMatch.matches(
                contentConversationId = "c1",
                contentPostId = "p1",
                activeConversationId = "c2",
                activePostId = "p2",
            )
        ).isFalse()
    }
}
