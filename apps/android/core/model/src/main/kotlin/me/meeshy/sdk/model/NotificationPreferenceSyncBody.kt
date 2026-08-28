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
    /**
     * Projects the gateway block BACK onto the device-local one — the read half of [from],
     * used when `user:preferences-updated` (category scope) says another device changed this
     * block and the store has to catch up (issue #4133).
     *
     * [current] is not a convenience: this body carries the gateway's fields and **only**
     * those, so the local-only `extras` map has no value on the wire. Rebuilding the block
     * from the response alone would silently erase a device-side extension on every
     * broadcast. Everything the gateway owns is taken from the response; everything it does
     * not know about is carried over from [current].
     */
    public fun toPreferences(current: UserNotificationPreferences): UserNotificationPreferences =
        current.copy(
            pushEnabled = pushEnabled,
            emailEnabled = emailEnabled,
            soundEnabled = soundEnabled,
            vibrationEnabled = vibrationEnabled,
            newMessageEnabled = newMessageEnabled,
            missedCallEnabled = missedCallEnabled,
            voicemailEnabled = voicemailEnabled,
            systemEnabled = systemEnabled,
            conversationEnabled = conversationEnabled,
            replyEnabled = replyEnabled,
            mentionEnabled = mentionEnabled,
            reactionEnabled = reactionEnabled,
            contactRequestEnabled = contactRequestEnabled,
            groupInviteEnabled = groupInviteEnabled,
            memberJoinedEnabled = memberJoinedEnabled,
            memberLeftEnabled = memberLeftEnabled,
            postLikeEnabled = postLikeEnabled,
            postCommentEnabled = postCommentEnabled,
            postRepostEnabled = postRepostEnabled,
            storyReactionEnabled = storyReactionEnabled,
            commentReplyEnabled = commentReplyEnabled,
            commentLikeEnabled = commentLikeEnabled,
            dndEnabled = dndEnabled,
            dndStartTime = dndStartTime,
            dndEndTime = dndEndTime,
            dndDays = dndDays,
            showPreview = showPreview,
            showSenderName = showSenderName,
            groupNotifications = groupNotifications,
            notificationBadgeEnabled = notificationBadgeEnabled,
        )

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
