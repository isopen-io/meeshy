package me.meeshy.app.feed

import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.post.GestureRefusal
import me.meeshy.sdk.post.PostGesture
import me.meeshy.sdk.publication.PublicationNotice

/**
 * A feedback the feed shows once, in the reader's language — never the raw technical message
 * a failed call carries. Mirrors iOS `FeedbackToastManager` and its keys (`feed.load.error`,
 * `feed.repost.error`, `feed.post.reported`, `feed.post.toast.published`…); the screen maps each
 * value to its string through [FeedNotice.messageRes].
 */
enum class FeedNotice(val isError: Boolean) {
    LOAD_FAILED(true),
    LIKE_FAILED(true),
    BOOKMARK_FAILED(true),
    BOOKMARKED(false),
    DAILY_REACTION_LIMIT(true),
    REPOSTED(false),
    REPOST_FAILED(true),
    PIN_FAILED(true),
    PINNED(false),
    DELETE_FAILED(true),
    DELETED(false),
    REPORT_FAILED(true),
    REPORTED(false),
    PUBLISH_FAILED(true),
    PUBLISHED(false),
    PUBLISH_QUEUED(false),
    TRANSLATION_FAILED(true),
    UNBOOKMARKED(false),
    /** Fermer ou rouvrir les commentaires n'a pas abouti : le menu est revenu à l'état d'avant (#16541). */
    COMMENT_SETTINGS_FAILED(true),
}

/** Le retour que le fil montre pour une publication que la file de l'appareil a prise, ou n'a pas pu prendre (#13863). */
internal val PublicationNotice.feedNotice: FeedNotice
    get() = when (this) {
        PublicationNotice.QUEUED -> FeedNotice.PUBLISH_QUEUED
        PublicationNotice.FAILED -> FeedNotice.PUBLISH_FAILED
    }

/**
 * Ce que le fil dit d'un geste que la file a perdu : la limite du jour quand la passerelle l'a nommée, sinon l'échec du
 * geste (iOS `feed.like.error` / `feed.bookmark.error`).
 */
internal val GestureRefusal.feedNotice: FeedNotice
    get() = when {
        gesture == PostGesture.LIKE && reason?.contains(DailyGestureLimit.REACTION_CODE) == true -> FeedNotice.DAILY_REACTION_LIMIT
        gesture == PostGesture.LIKE -> FeedNotice.LIKE_FAILED
        else -> FeedNotice.BOOKMARK_FAILED
    }
