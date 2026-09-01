package me.meeshy.sdk.model

import java.time.LocalDateTime

/** What a real-time `notification:new` event should do to the in-app toast (feature-parity §M). */
public sealed interface NotificationToastDecision {
    /** Surface [notification] as a toast. */
    public data class Show(val notification: ApiNotification) : NotificationToastDecision

    /** The notification's conversation/post is the one already on screen — consumed silently. */
    public data object SuppressedActiveScreen : NotificationToastDecision

    /** A duplicate delivery (APN + socket racing for the same event) within the dedup window. */
    public data object Deduplicated : NotificationToastDecision

    /** Push disabled, inside the quiet-hours window, or this type's per-type toggle is off. */
    public data object BlockedByPreferences : NotificationToastDecision
}

/**
 * Pure decision core for the in-app real-time notification toast (feature-parity §M) — the
 * dedup/active-screen-suppression/push+DND gate extracted into a testable function from iOS
 * `NotificationToastManager.handleNewNotification`'s impure guard-chain (iOS has no isolated
 * pure version of this logic; this is a genuine extraction, not a straight port).
 *
 * The gate has three preference layers, applied in order once active-screen suppression and
 * dedup are cleared: [UserNotificationPreferences.pushEnabled] (the push master), the DND
 * window ([DndWindow.isActive]), then the PER-TYPE toggle ([NotificationTypeToggle.isEnabled],
 * a faithful port of iOS `isTypeEnabled` keyed on the wire `type` string). Any of the three
 * failing yields [NotificationToastDecision.BlockedByPreferences]; a type with no governing
 * toggle (translation, gamification, and the not-yet-modelled incoming-call / friend-content
 * categories) passes the third layer, exactly as iOS treats its toggle-less types.
 *
 * [isDuplicateDelivery] is a precomputed boolean rather than a self-managed time window: the
 * "was this id already shown in the last 2s" check is inherently stateful (compares across
 * calls), so it stays the caller's responsibility — this function decides given one event and
 * the current context, nothing more.
 */
public object NotificationToastPolicy {

    public fun decide(
        notification: ApiNotification,
        activeConversationId: String?,
        activePostId: String?,
        isDuplicateDelivery: Boolean,
        preferences: UserNotificationPreferences,
        now: LocalDateTime,
    ): NotificationToastDecision {
        val context = notification.context
        val matchesActiveScreen = ActiveContextMatch.matches(
            contentConversationId = context?.conversationId,
            contentPostId = context?.postId,
            activeConversationId = activeConversationId,
            activePostId = activePostId,
        )
        if (matchesActiveScreen) {
            return NotificationToastDecision.SuppressedActiveScreen
        }
        if (isDuplicateDelivery) return NotificationToastDecision.Deduplicated
        if (!preferences.pushEnabled) return NotificationToastDecision.BlockedByPreferences
        if (DndWindow.isActive(preferences, now)) return NotificationToastDecision.BlockedByPreferences
        if (!NotificationTypeToggle.isEnabled(notification.type, preferences)) {
            return NotificationToastDecision.BlockedByPreferences
        }
        return NotificationToastDecision.Show(notification)
    }
}
