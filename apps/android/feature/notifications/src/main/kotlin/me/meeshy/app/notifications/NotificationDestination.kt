package me.meeshy.app.notifications

import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.game.GameTarget
import me.meeshy.sdk.model.push.PushPayload
import me.meeshy.sdk.model.push.PushTapDestination

/**
 * Where tapping a notification row leads — port of iOS `NotificationContentRouter` +
 * `RootView.navigateFromNotification` (`apps/ios/Meeshy/Features/Navigation/
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
 * [PushTapDestination]): the story tray endpoint
 * (`GET posts/feed/stories`) only ever serves `type: PostType.STORY`, so a fresh MOOD/STATUS
 * publication is never actually in the tray it would open — [Post] is the only destination that
 * resolves a mood's own id (`GET /posts/:postId`, unfiltered by type). A NEW mood now opens its
 * own full-screen page ([Mood]); a reaction or comment on a mood keeps the [Post] detail.
 */
public sealed interface NotificationDestination {
    public data class Conversation(val conversationId: String) : NotificationDestination
    public data class Post(val postId: String) : NotificationDestination
    public data class Reel(val postId: String) : NotificationDestination
    public data class Story(val userId: String) : NotificationDestination
    public data class Profile(val userId: String) : NotificationDestination

    /** Une NOUVELLE humeur ouvre sa page plein écran (iOS `Route.moodSpotlight`, #10814). */
    public data class Mood(val statusId: String) : NotificationDestination

    /** Un palier ou un événement du jeu ouvre l'écran que la carte de navigation du jeu nomme (iOS `GameNavigationMap.entry`). */
    public data class Game(val target: GameTarget) : NotificationDestination
    public data object None : NotificationDestination
}

/**
 * Pure `type × entities → destination` resolution of a row of the in-app list. ONE table for the
 * row and the system banner : [PushTapDestination] (`:core:model`, iOS
 * `RootNotificationNavigator.navigateFromNotification`) — the row is projected onto the push keys
 * it carries, and the destinations the list does not open from a row (the notifications list
 * itself) stay put ([NotificationDestination.None]).
 */
public object NotificationDestinationResolver {

    public fun resolve(notification: ApiNotification): NotificationDestination =
        when (val destination = PushTapDestination.resolve(payloadOf(notification))) {
            is PushTapDestination.Conversation -> NotificationDestination.Conversation(destination.conversationId)
            is PushTapDestination.Post -> NotificationDestination.Post(destination.postId)
            is PushTapDestination.Reel -> NotificationDestination.Reel(destination.postId)
            is PushTapDestination.Story -> NotificationDestination.Story(destination.userId)
            is PushTapDestination.Mood -> NotificationDestination.Mood(destination.statusId)
            is PushTapDestination.Profile -> NotificationDestination.Profile(destination.userId)
            is PushTapDestination.Game -> NotificationDestination.Game(destination.target)
            PushTapDestination.Notifications, PushTapDestination.None -> NotificationDestination.None
        }

    private fun payloadOf(notification: ApiNotification): PushPayload {
        fun String?.present(): String? = this?.takeIf { it.isNotBlank() }
        return PushPayload(
            type = notification.type,
            conversationId = notification.context?.conversationId.present(),
            postId = (notification.context?.postId ?: notification.metadata?.postId).present(),
            postType = (notification.metadata?.postType ?: notification.metadata?.contentType).present(),
            senderId = notification.actor?.id.present(),
        )
    }
}

/** Fans the resolved destination out to whichever nav lambda [NotificationsScreen] was given. */
internal fun NotificationDestination.dispatch(
    onOpenConversation: (String) -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenReel: (String) -> Unit,
    onOpenStory: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenMood: (String) -> Unit = onOpenPost,
    onOpenGame: (GameTarget) -> Unit = {},
) {
    when (this) {
        is NotificationDestination.Conversation -> onOpenConversation(conversationId)
        is NotificationDestination.Post -> onOpenPost(postId)
        is NotificationDestination.Reel -> onOpenReel(postId)
        is NotificationDestination.Story -> onOpenStory(userId)
        is NotificationDestination.Profile -> onOpenProfile(userId)
        is NotificationDestination.Mood -> onOpenMood(statusId)
        is NotificationDestination.Game -> onOpenGame(target)
        NotificationDestination.None -> Unit
    }
}
