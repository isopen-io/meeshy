package me.meeshy.app.notifications

import me.meeshy.sdk.model.ApiNotification

/**
 * Where tapping a notification row leads — port of iOS `NotificationContentRouter` +
 * `RootView.navigateFromNotification` (`apps/ios/Meeshy/Features/Main/Navigation/
 * NotificationContentRouter.swift`, `Views/RootView.swift`), scoped to the destinations Android
 * can actually reach today.
 *
 * [Story] is keyed by the AUTHOR's user id, not the story's own id — Android's story viewer
 * (`Routes.story(userId)`, `StoryViewerViewModel`) opens a user's whole tray, unlike iOS/web's
 * story screen which is addressable by content id. [resolve] only produces [Story] when the
 * notification's actor is unambiguously the content's author (a fresh publication); a reaction or
 * comment on someone else's story carries no author id anywhere on [ApiNotification], so guessing
 * one (e.g. the actor, who is the *commenter* there, not the owner) would open the wrong person's
 * tray — a worse failure than falling back to [Post], which is addressable by the story's own id
 * and always resolves the right content.
 *
 * The [Story] shortcut is further restricted to `friend_new_story` alone (see
 * [NotificationDestinationResolver.OWNED_CONTENT_TYPES]): the story tray endpoint
 * (`GET posts/feed/stories`) only ever serves `type: PostType.STORY`, so a fresh MOOD/STATUS
 * publication is never actually in the tray it would open — [Post] is the only destination that
 * resolves a mood's own id (`GET /posts/:postId`, unfiltered by type).
 */
public sealed interface NotificationDestination {
    public data class Conversation(val conversationId: String) : NotificationDestination
    public data class Post(val postId: String) : NotificationDestination
    public data class Reel(val postId: String) : NotificationDestination
    public data class Story(val userId: String) : NotificationDestination
    public data class Profile(val userId: String) : NotificationDestination
    public data object None : NotificationDestination
}

/**
 * Pure `type × entities → destination` resolution — the single source both the tap handler and
 * its tests exercise. No Android/Compose dependency, so it runs as a plain JVM unit test.
 */
public object NotificationDestinationResolver {

    /**
     * Types resolved through `context.conversationId` — messages, their lifecycle, mentions,
     * reactions on a message, calls, and every conversation-membership event. Mirrors the first
     * `switch` case of iOS `navigateFromNotification`. Compared lowercase: the gateway serves both
     * `new_message` and its legacy uppercase alias `NEW_MESSAGE` (`NotificationBannerFraming`
     * applies the same normalisation).
     */
    private val CONVERSATION_TYPES = setOf(
        "new_message", "message_reply", "reply", "story_reply",
        "message_edited", "message_deleted", "message_pinned", "message_forwarded",
        "user_mentioned", "mention",
        "message_reaction", "reaction",
        "translation_completed", "translation_ready", "transcription_completed", "voice_clone_ready",
        "missed_call", "call_declined", "incoming_call", "call_ended", "call",
        "added_to_conversation", "new_conversation", "new_conversation_direct", "new_conversation_group",
        "removed_from_conversation",
        "community_invite", "community_joined", "community_left",
        "member_joined", "member_left", "member_removed", "member_promoted", "member_demoted",
        "member_role_changed",
    )

    /** Friend/contact lifecycle — opens the actor's profile, mirroring iOS's profile sheet. */
    private val RELATION_TYPES = setOf(
        "friend_request", "contact_request", "friend_accepted", "contact_accepted", "status_update",
    )

    /**
     * "Fresh content" types where the actor IS unambiguously the content's author. Only
     * `friend_new_story` earns the [NotificationDestination.Story] tray shortcut — the tray
     * endpoint serves `type: PostType.STORY` exclusively, so a fresh mood/status has no tray
     * to land in and falls through to [NotificationDestination.Post] instead.
     */
    private val OWNED_CONTENT_TYPES = setOf("friend_new_story")

    public fun resolve(notification: ApiNotification): NotificationDestination {
        val type = notification.type.lowercase()
        val conversationId = notification.context?.conversationId?.takeIf { it.isNotBlank() }
        val postId = (notification.context?.postId ?: notification.metadata?.postId)
            ?.takeIf { it.isNotBlank() }

        if (type in CONVERSATION_TYPES) {
            if (conversationId != null) return NotificationDestination.Conversation(conversationId)
            // A mention (or, legacy, a story reply) can live in a post/comment instead of a
            // conversation — the gateway's post/comment mention fan-out ships no conversationId.
            // Without this fallback the tap was a dead end for every mention made outside a chat.
            if (postId != null) return resolveContent(notification, type, postId)
            return NotificationDestination.None
        }

        if (type in RELATION_TYPES) {
            val actorId = notification.actor?.id?.takeIf { it.isNotBlank() }
            return actorId?.let(NotificationDestination::Profile) ?: NotificationDestination.None
        }

        if (postId != null) return resolveContent(notification, type, postId)
        if (conversationId != null) return NotificationDestination.Conversation(conversationId)
        return NotificationDestination.None
    }

    private fun resolveContent(
        notification: ApiNotification,
        type: String,
        postId: String,
    ): NotificationDestination {
        val entity = (notification.metadata?.postType ?: notification.metadata?.contentType)?.uppercase()

        if (entity == "REEL") return NotificationDestination.Reel(postId)

        if (entity == "STORY" || entity == "STATUS" || entity == "MOOD") {
            if (type in OWNED_CONTENT_TYPES) {
                notification.actor?.id?.takeIf { it.isNotBlank() }?.let {
                    return NotificationDestination.Story(it)
                }
            }
            // See the [NotificationDestination.Story] doc: no author id is available for a
            // reaction/comment on someone else's story — the post's own id always resolves.
            return NotificationDestination.Post(postId)
        }

        return NotificationDestination.Post(postId)
    }
}

/** Fans the resolved destination out to whichever nav lambda [NotificationsScreen] was given. */
internal fun NotificationDestination.dispatch(
    onOpenConversation: (String) -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenReel: (String) -> Unit,
    onOpenStory: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    when (this) {
        is NotificationDestination.Conversation -> onOpenConversation(conversationId)
        is NotificationDestination.Post -> onOpenPost(postId)
        is NotificationDestination.Reel -> onOpenReel(postId)
        is NotificationDestination.Story -> onOpenStory(userId)
        is NotificationDestination.Profile -> onOpenProfile(userId)
        NotificationDestination.None -> Unit
    }
}
