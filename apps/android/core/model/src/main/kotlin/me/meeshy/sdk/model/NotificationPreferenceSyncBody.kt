package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.relation.RelationAudienceChoice

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
    val callsEnabled: Boolean,
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
    val friendContentEnabled: Boolean,
    val contactActivityEnabled: Boolean? = null,
    val gameEnabled: Boolean? = null,
    val dndEnabled: Boolean,
    val dndStartTime: String,
    val dndEndTime: String,
    val dndDays: List<DndDay>,
    val dndUtcOffsetMinutes: Int? = null,
    val showPreview: Boolean,
    val showSenderName: Boolean,
    val groupNotifications: Boolean,
    val notificationBadgeEnabled: Boolean,
    // #14064 — les crans d'entourage, une clé plate par action (#13929). `null` = non connu de cet appareil :
    // la clé ne part pas (`explicitNulls = false`), si bien qu'un interrupteur basculé ici n'écrase jamais
    // le cran qu'un autre appareil a réglé.
    val circlePublicationPost: RelationAudienceChoice? = null,
    val circlePublicationReel: RelationAudienceChoice? = null,
    val circlePublicationStory: RelationAudienceChoice? = null,
    val circlePublicationMood: RelationAudienceChoice? = null,
    val circlePublicationRepost: RelationAudienceChoice? = null,
    val circlePublicationShare: RelationAudienceChoice? = null,
    val circleOnMyContentComment: RelationAudienceChoice? = null,
    val circleOnMyContentReaction: RelationAudienceChoice? = null,
    val circleOnMyContentShare: RelationAudienceChoice? = null,
    val circleOnMyContentRepost: RelationAudienceChoice? = null,
    val circleOnMyContentQuote: RelationAudienceChoice? = null,
    val circleOnMyContentReference: RelationAudienceChoice? = null,
    val circleOnMyContentMention: RelationAudienceChoice? = null,
    val circleElsewhereComment: RelationAudienceChoice? = null,
    val circleElsewhereReaction: RelationAudienceChoice? = null,
    val circleElsewhereShare: RelationAudienceChoice? = null,
    val circleElsewhereQuote: RelationAudienceChoice? = null,
    val circleElsewhereReference: RelationAudienceChoice? = null,
    val circleElsewhereMention: RelationAudienceChoice? = null,
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
            callsEnabled = callsEnabled,
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
            friendContentEnabled = friendContentEnabled,
            contactActivityEnabled = contactActivityEnabled ?: current.contactActivityEnabled,
            gameEnabled = gameEnabled ?: current.gameEnabled,
            dndEnabled = dndEnabled,
            dndStartTime = dndStartTime,
            dndEndTime = dndEndTime,
            dndDays = dndDays,
            dndUtcOffsetMinutes = dndUtcOffsetMinutes ?: current.dndUtcOffsetMinutes,
            showPreview = showPreview,
            showSenderName = showSenderName,
            groupNotifications = groupNotifications,
            notificationBadgeEnabled = notificationBadgeEnabled,
            circleAudience = current.circleAudience + servedCircleAudience(),
        )

    /** Les crans que la réponse porte ; une clé absente ou un cran inconnu (lu `null`) garde la valeur locale. */
    private fun servedCircleAudience(): Map<String, RelationAudienceChoice> =
        listOf(
            "circlePublicationPost" to circlePublicationPost,
            "circlePublicationReel" to circlePublicationReel,
            "circlePublicationStory" to circlePublicationStory,
            "circlePublicationMood" to circlePublicationMood,
            "circlePublicationRepost" to circlePublicationRepost,
            "circlePublicationShare" to circlePublicationShare,
            "circleOnMyContentComment" to circleOnMyContentComment,
            "circleOnMyContentReaction" to circleOnMyContentReaction,
            "circleOnMyContentShare" to circleOnMyContentShare,
            "circleOnMyContentRepost" to circleOnMyContentRepost,
            "circleOnMyContentQuote" to circleOnMyContentQuote,
            "circleOnMyContentReference" to circleOnMyContentReference,
            "circleOnMyContentMention" to circleOnMyContentMention,
            "circleElsewhereComment" to circleElsewhereComment,
            "circleElsewhereReaction" to circleElsewhereReaction,
            "circleElsewhereShare" to circleElsewhereShare,
            "circleElsewhereQuote" to circleElsewhereQuote,
            "circleElsewhereReference" to circleElsewhereReference,
            "circleElsewhereMention" to circleElsewhereMention,
        ).mapNotNull { (key, choice) -> choice?.let { key to it } }.toMap()

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
                callsEnabled = prefs.callsEnabled,
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
                friendContentEnabled = prefs.friendContentEnabled,
                contactActivityEnabled = prefs.contactActivityEnabled,
                gameEnabled = prefs.gameEnabled,
                dndEnabled = prefs.dndEnabled,
                dndStartTime = prefs.dndStartTime,
                dndEndTime = prefs.dndEndTime,
                dndDays = prefs.dndDays,
                dndUtcOffsetMinutes = prefs.dndUtcOffsetMinutes,
                showPreview = prefs.showPreview,
                showSenderName = prefs.showSenderName,
                groupNotifications = prefs.groupNotifications,
                notificationBadgeEnabled = prefs.notificationBadgeEnabled,
                circlePublicationPost = prefs.circleAudience["circlePublicationPost"],
                circlePublicationReel = prefs.circleAudience["circlePublicationReel"],
                circlePublicationStory = prefs.circleAudience["circlePublicationStory"],
                circlePublicationMood = prefs.circleAudience["circlePublicationMood"],
                circlePublicationRepost = prefs.circleAudience["circlePublicationRepost"],
                circlePublicationShare = prefs.circleAudience["circlePublicationShare"],
                circleOnMyContentComment = prefs.circleAudience["circleOnMyContentComment"],
                circleOnMyContentReaction = prefs.circleAudience["circleOnMyContentReaction"],
                circleOnMyContentShare = prefs.circleAudience["circleOnMyContentShare"],
                circleOnMyContentRepost = prefs.circleAudience["circleOnMyContentRepost"],
                circleOnMyContentQuote = prefs.circleAudience["circleOnMyContentQuote"],
                circleOnMyContentReference = prefs.circleAudience["circleOnMyContentReference"],
                circleOnMyContentMention = prefs.circleAudience["circleOnMyContentMention"],
                circleElsewhereComment = prefs.circleAudience["circleElsewhereComment"],
                circleElsewhereReaction = prefs.circleAudience["circleElsewhereReaction"],
                circleElsewhereShare = prefs.circleAudience["circleElsewhereShare"],
                circleElsewhereQuote = prefs.circleAudience["circleElsewhereQuote"],
                circleElsewhereReference = prefs.circleAudience["circleElsewhereReference"],
                circleElsewhereMention = prefs.circleAudience["circleElsewhereMention"],
            )
    }
}
