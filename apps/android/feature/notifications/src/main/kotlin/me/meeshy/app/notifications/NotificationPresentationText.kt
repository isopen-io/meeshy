package me.meeshy.app.notifications

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.BannerHeadline
import me.meeshy.sdk.model.GameSurfaceTitle
import me.meeshy.sdk.model.MediaSummary
import me.meeshy.sdk.model.NotificationMessageDetail
import me.meeshy.sdk.model.NotificationMilestone
import me.meeshy.sdk.model.NotificationRowCopy
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
        headline.actor.ifBlank { stringResource(R.string.notification_banner_someone) },
        headline.groupName,
    )
    is BannerHeadline.Someone -> withAction(stringResource(R.string.notification_banner_someone), headline.action)
    is BannerHeadline.GameSurface -> withAction(
        stringResource(
            when (headline.surface) {
                GameSurfaceTitle.LEAGUE_RESULT -> R.string.notification_game_league_result_title
                GameSurfaceTitle.SEASON_STEP -> R.string.notification_game_season_step_title
                GameSurfaceTitle.MISSION_WINDOW -> R.string.notification_game_mission_window_title
            },
        ),
        headline.action,
    )
}

/** Le titre suivi de la phrase d'action servie, sauf si le titre la porte déjà. */
private fun withAction(head: String, action: String?): String =
    if (action == null || head.endsWith(action)) head else "$head $action"

/**
 * What [NotificationBannerHost] shows once the recipient's own preview toggle
 * (`UserNotificationPreferences.showPreview`) is applied — mirrors the gateway's
 * `showPreview:false` substitution for the PUSH banner
 * (`NotificationService.pushMessage` / `pushReproducedNotification`, both drop every
 * content-bearing field and replace the body with a generic localized string). This client must
 * reproduce that substitution itself: `notification:new` (the socket event
 * [NotificationBannerViewModel] renders) carries the FULL content unconditionally — the
 * gateway's substitution only ever gated the PUSH payload, never the socket one.
 *
 * Only content fields are cleared — [BannerHeadline] (sender identity) is untouched, exactly as
 * on the gateway: `showSenderName` gates the title independently of `showPreview` gating the
 * body, and this function does not decide `showSenderName`.
 */
internal fun NotificationBannerPresentation.appliedPreviewSetting(
    showPreview: Boolean,
): NotificationBannerPresentation = if (showPreview) {
    this
} else {
    copy(body = null, mediaSummary = null, reactionBadge = null, thumbnailUrl = null, detail = null)
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
    presentation.detail?.let { detail ->
        return detail.summary(
            NotificationMessageDetail.Labels(
                sharedLocation = stringResource(R.string.notification_detail_shared_location),
                invitation = stringResource(R.string.notification_detail_invitation),
            ),
        )
    }
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

/**
 * Les mots de repli d'un palier dont le titre n'est pas servi (ligne d'avant `tierRank`), dans la langue
 * de l'application. Sans palier lisible (axe ou exploit inconnu de ce module), on retombe sur la headline.
 */
@Composable
internal fun rememberNotificationRowCopy(): NotificationRowCopy {
    val resources = LocalContext.current.resources
    return remember(resources) {
        object : NotificationRowCopy {
            override fun milestoneName(milestone: NotificationMilestone): String? = when (milestone) {
                is NotificationMilestone.Level -> milestone.level?.let { resources.getString(R.string.notification_milestone_level_name, it) }
                is NotificationMilestone.Streak -> milestone.days?.let { resources.getString(R.string.notification_milestone_streak_name, it) }
                else -> null
            }

            override fun milestoneReason(milestone: NotificationMilestone, inviteeName: String?): String? {
                if (milestone !is NotificationMilestone.Badge) return null
                if (milestone.axis == INVITE_JOINED_AXIS && inviteeName != null) {
                    return resources.getString(R.string.notification_milestone_invite_joined_reason, inviteeName)
                }
                return milestone.threshold?.let { resources.getString(R.string.notification_milestone_badge_reason, it) }
            }
        }
    }
}

private const val INVITE_JOINED_AXIS = "inviteJoined"
