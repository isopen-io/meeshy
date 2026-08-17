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

    /** Push disabled, or inside the configured quiet-hours window. */
    public data object BlockedByPreferences : NotificationToastDecision
}

/**
 * Pure decision core for the in-app real-time notification toast (feature-parity §M) — the
 * dedup/active-screen-suppression/push+DND gate extracted into a testable function from iOS
 * `NotificationToastManager.handleNewNotification`'s impure guard-chain (iOS has no isolated
 * pure version of this logic; this is a genuine extraction, not a straight port).
 *
 * Deliberately narrower than iOS's own gate for now: [UserNotificationPreferences.pushEnabled]
 * and the DND window ([DndWindow.isActive]) are ported — both already pure, existing
 * predicates. The PER-TYPE toggle gate (iOS `isTypeEnabled`, an 80-case switch over
 * `MeeshyNotificationType`) is intentionally NOT ported here: Android has no existing raw
 * wire-type→toggle resolver to reuse (the closest, [NotificationTypeCatalog], maps a coarser
 * 17-case UI category, not the wire enum) — building one is real, separate work, left open
 * rather than invented under this slice's scope. Until then, every type is treated as
 * always-enabled once push+DND pass.
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
        val matchesActiveConversation = context?.conversationId != null &&
            context.conversationId == activeConversationId
        val matchesActivePost = context?.postId != null && context.postId == activePostId
        if (matchesActiveConversation || matchesActivePost) {
            return NotificationToastDecision.SuppressedActiveScreen
        }
        if (isDuplicateDelivery) return NotificationToastDecision.Deduplicated
        if (!preferences.pushEnabled) return NotificationToastDecision.BlockedByPreferences
        if (DndWindow.isActive(preferences, now)) return NotificationToastDecision.BlockedByPreferences
        return NotificationToastDecision.Show(notification)
    }
}
