package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationActor
import me.meeshy.sdk.model.NotificationContext
import me.meeshy.sdk.model.NotificationMetadata
import me.meeshy.sdk.model.NotificationState
import org.junit.Test

/**
 * `type × entities → destination` — the pure resolver a tap dispatches through (issue #4793).
 * Mirrors iOS `NotificationContentRouterTests` in shape (a table of type/context/metadata
 * combinations against the resolved surface), scoped to what Android's own routes can reach.
 */
class NotificationDestinationResolverTest {

    private fun notification(
        type: String,
        conversationId: String? = null,
        postId: String? = null,
        actorId: String? = null,
        postType: String? = null,
        contentType: String? = null,
        conversationType: String? = null,
        metadataPostId: String? = null,
    ) = ApiNotification(
        id = "n1",
        type = type,
        actor = actorId?.let { NotificationActor(id = it) },
        context = NotificationContext(
            conversationId = conversationId,
            conversationType = conversationType,
            postId = postId,
        ),
        metadata = NotificationMetadata(postType = postType, contentType = contentType, postId = metadataPostId),
        state = NotificationState(createdAt = "2026-01-01"),
    )

    // --- Conversation family ---

    @Test
    fun `a message notification with a conversationId opens that conversation`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("new_message", conversationId = "c1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Conversation("c1"))
    }

    @Test
    fun `the legacy uppercase wire type resolves the same as its lowercase form`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("NEW_MESSAGE", conversationId = "c1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Conversation("c1"))
    }

    @Test
    fun `a missed call opens the conversation it happened in`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("missed_call", conversationId = "c1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Conversation("c1"))
    }

    @Test
    fun `a mention without a conversationId falls back to the post it mentions`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("user_mentioned", conversationId = null, postId = "p1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    @Test
    fun `a message notification with neither conversation nor post is a dead end`() {
        val dest = NotificationDestinationResolver.resolve(notification("message_reply"))

        assertThat(dest).isEqualTo(NotificationDestination.None)
    }

    @Test
    fun `a blank conversationId is treated as absent`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("new_message", conversationId = " ", postId = "p1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    // --- Relation family ---

    @Test
    fun `a friend request opens the requester's profile`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("friend_request", actorId = "u1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Profile("u1"))
    }

    @Test
    fun `a contact accepted notification opens the actor's profile`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("contact_accepted", actorId = "u1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Profile("u1"))
    }

    @Test
    fun `a friend request without an actor is a dead end`() {
        val dest = NotificationDestinationResolver.resolve(notification("friend_request"))

        assertThat(dest).isEqualTo(NotificationDestination.None)
    }

    // --- Social content family ---

    @Test
    fun `a post like opens the post detail`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("post_like", postId = "p1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    @Test
    fun `the post id is read from metadata when the context omits it`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("post_like", postId = null, metadataPostId = "p1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    @Test
    fun `a reel-tagged notification opens the reel player, never the post detail`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("post_comment", postId = "p1", postType = "REEL"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Reel("p1"))
    }

    @Test
    fun `a fresh story publication opens its author's story tray`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("friend_new_story", postId = "p1", actorId = "author1", postType = "STORY"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Story("author1"))
    }

    // A mood/status has no tray to land in — the story tray endpoint serves
    // `type: PostType.STORY` exclusively — so it falls back to the post detail rather
    // than opening the author's (STORY-only) tray, which the mood is never actually in.
    @Test
    fun `a fresh mood publication opens the post detail, not its author's story tray`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("friend_new_mood", postId = "p1", actorId = "author1", postType = "MOOD"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    @Test
    fun `a reaction on a story falls back to the post detail — the actor is the reactor, not the owner`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("story_reaction", postId = "p1", actorId = "reactor1", postType = "STORY"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    @Test
    fun `a comment on a status falls back to the post detail`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("story_new_comment", postId = "p1", actorId = "commenter1", postType = "STATUS"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    @Test
    fun `the friend_new_story owner shortcut still needs an actor id`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("friend_new_story", postId = "p1", postType = "STORY"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    @Test
    fun `the contentType discriminant is read when postType is absent`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("friend_new_mood", postId = "p1", actorId = "author1", contentType = "MOOD"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    @Test
    fun `an unknown discriminant falls back to the post detail`() {
        val dest = NotificationDestinationResolver.resolve(
            notification("post_repost", postId = "p1"),
        )

        assertThat(dest).isEqualTo(NotificationDestination.Post("p1"))
    }

    // --- No destination ---

    @Test
    fun `a system notification has no navigable destination`() {
        val dest = NotificationDestinationResolver.resolve(notification("security_alert"))

        assertThat(dest).isEqualTo(NotificationDestination.None)
    }

    // --- dispatch() ---

    @Test
    fun `dispatch fans a conversation destination to onOpenConversation only`() {
        val opened = mutableMapOf<String, String?>()
        NotificationDestination.Conversation("c1").dispatch(
            onOpenConversation = { opened["conversation"] = it },
            onOpenPost = { opened["post"] = it },
            onOpenReel = { opened["reel"] = it },
            onOpenStory = { opened["story"] = it },
            onOpenProfile = { opened["profile"] = it },
        )

        assertThat(opened).containsExactly("conversation", "c1")
    }

    @Test
    fun `dispatch fans a reel destination to onOpenReel only`() {
        val opened = mutableMapOf<String, String?>()
        NotificationDestination.Reel("p1").dispatch(
            onOpenConversation = { opened["conversation"] = it },
            onOpenPost = { opened["post"] = it },
            onOpenReel = { opened["reel"] = it },
            onOpenStory = { opened["story"] = it },
            onOpenProfile = { opened["profile"] = it },
        )

        assertThat(opened).containsExactly("reel", "p1")
    }

    @Test
    fun `dispatch is a no-op for None`() {
        val opened = mutableMapOf<String, String?>()
        NotificationDestination.None.dispatch(
            onOpenConversation = { opened["conversation"] = it },
            onOpenPost = { opened["post"] = it },
            onOpenReel = { opened["reel"] = it },
            onOpenStory = { opened["story"] = it },
            onOpenProfile = { opened["profile"] = it },
        )

        assertThat(opened).isEmpty()
    }
}
