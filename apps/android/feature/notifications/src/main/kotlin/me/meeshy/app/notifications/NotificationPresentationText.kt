package me.meeshy.app.notifications

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.BannerHeadline
import me.meeshy.sdk.model.MediaSummary
import me.meeshy.sdk.model.NotificationBannerPresentation

/**
 * Turns the two pieces of a [NotificationBannerPresentation] that carry raw data instead of a
 * finished string — [BannerHeadline.InConversation] and [MediaSummary] — into localized text.
 *
 * Shared by [NotificationBannerHost] (the toast) and [NotificationsScreen] (the list row): both
 * render the SAME server-composed action phrase (`core/model`'s `NotificationBannerFraming` — the
 * title server sends, or its per-type fallback when absent), and this is the one place either
 * turns it into Android string resources. `core/model` has no resources of its own, so the raw
 * pieces travel here in kind.
 *
 * A [BannerHeadline.Plain] with a blank [BannerHeadline.Plain.text] means the gateway sent
 * a `system` notification with neither a `title` nor an actor (e.g. a friend-request refusal,
 * a link-share admin notice) — `headline.text.ifBlank { … }` replies with the same generic
 * sender label both surfaces used before headline resolution moved server-side.
 */
@Composable
internal fun headlineText(headline: BannerHeadline): String = when (headline) {
    is BannerHeadline.Plain -> headline.text.ifBlank { stringResource(R.string.notifications_system_sender) }
    is BannerHeadline.InConversation -> stringResource(
        R.string.notification_banner_in_conversation,
        headline.actor,
        headline.groupName,
    )
}

/**
 * The body, or failing that a translated media summary — order matters: a content with text shows
 * it, a content without at least says what kind of media it is.
 */
@Composable
internal fun presentationBodyText(presentation: NotificationBannerPresentation): String? {
    presentation.body?.let { body ->
        val badge = presentation.reactionBadge
        return if (badge != null) "$badge $body" else body
    }
    presentation.reactionBadge?.let { return it }
    return presentation.mediaSummary?.let { summary ->
        stringResource(
            when (summary) {
                MediaSummary.IMAGE -> R.string.notification_banner_media_photo
                MediaSummary.VIDEO -> R.string.notification_banner_media_video
                MediaSummary.AUDIO -> R.string.notification_banner_media_audio
            }
        )
    }
}
