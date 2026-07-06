package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * The wire body for `PATCH /me/preferences/notification` (feature-parity §L).
 *
 * Projected from the device-local [UserNotificationPreferences] block by [from], this is the
 * single source of truth for the gateway `NotificationPreferenceSchema` contract: it carries
 * every one of the gateway's fields — and *only* those. The local-only `extras` map is
 * deliberately dropped so a device-side extension never leaks to the backend, and the DND
 * days ride as [DndDay] (whose `@SerialName` tokens are the lowercase strings the gateway
 * validates). Serialised with `encodeDefaults`, it is both the durable outbox payload and the
 * request body, so the enqueued snapshot and the delivered PATCH are byte-identical.
 */
@Serializable
public data class NotificationPreferenceSyncBody(
    val pushEnabled: Boolean,
    val emailEnabled: Boolean,
    val soundEnabled: Boolean,
    val vibrationEnabled: Boolean,
    val newMessageEnabled: Boolean,
    val missedCallEnabled: Boolean,
    val voicemailEnabled: Boolean,
    val systemEnabled: Boolean,
    val conversationEnabled: Boolean,
    val replyEnabled: Boolean,
    val mentionEnabled: Boolean,
    val reactionEnabled: Boolean,
    val contactRequestEnabled: Boolean,
    val groupInviteEnabled: Boolean,
    val memberJoinedEnabled: Boolean,
    val memberLeftEnabled: Boolean,
    val postLikeEnabled: Boolean,
    val postCommentEnabled: Boolean,
    val postRepostEnabled: Boolean,
    val storyReactionEnabled: Boolean,
    val commentReplyEnabled: Boolean,
    val commentLikeEnabled: Boolean,
    val dndEnabled: Boolean,
    val dndStartTime: String,
    val dndEndTime: String,
    val dndDays: List<DndDay>,
    val showPreview: Boolean,
    val showSenderName: Boolean,
    val groupNotifications: Boolean,
    val notificationBadgeEnabled: Boolean,
) {
    public companion object {
        /** Projects the device-local block into the gateway wire body (drops `extras`). */
        public fun from(prefs: UserNotificationPreferences): NotificationPreferenceSyncBody =
            NotificationPreferenceSyncBody(
                pushEnabled = prefs.pushEnabled,
                emailEnabled = prefs.emailEnabled,
                soundEnabled = prefs.soundEnabled,
                vibrationEnabled = prefs.vibrationEnabled,
                newMessageEnabled = prefs.newMessageEnabled,
                missedCallEnabled = prefs.missedCallEnabled,
                voicemailEnabled = prefs.voicemailEnabled,
                systemEnabled = prefs.systemEnabled,
                conversationEnabled = prefs.conversationEnabled,
                replyEnabled = prefs.replyEnabled,
                mentionEnabled = prefs.mentionEnabled,
                reactionEnabled = prefs.reactionEnabled,
                contactRequestEnabled = prefs.contactRequestEnabled,
                groupInviteEnabled = prefs.groupInviteEnabled,
                memberJoinedEnabled = prefs.memberJoinedEnabled,
                memberLeftEnabled = prefs.memberLeftEnabled,
                postLikeEnabled = prefs.postLikeEnabled,
                postCommentEnabled = prefs.postCommentEnabled,
                postRepostEnabled = prefs.postRepostEnabled,
                storyReactionEnabled = prefs.storyReactionEnabled,
                commentReplyEnabled = prefs.commentReplyEnabled,
                commentLikeEnabled = prefs.commentLikeEnabled,
                dndEnabled = prefs.dndEnabled,
                dndStartTime = prefs.dndStartTime,
                dndEndTime = prefs.dndEndTime,
                dndDays = prefs.dndDays,
                showPreview = prefs.showPreview,
                showSenderName = prefs.showSenderName,
                groupNotifications = prefs.groupNotifications,
                notificationBadgeEnabled = prefs.notificationBadgeEnabled,
            )
    }
}
