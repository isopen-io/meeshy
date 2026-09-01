package me.meeshy.sdk.model

/** What a real-time `notification:new` event should do to the in-app toast (feature-parity §M). */
public sealed interface NotificationToastDecision {
    /** Surface [notification] as a toast. */
    public data class Show(val notification: ApiNotification) : NotificationToastDecision

    /** The notification's conversation/post is the one already on screen — consumed silently. */
    public data object SuppressedActiveScreen : NotificationToastDecision

    /** A duplicate delivery (APN + socket racing for the same event) within the dedup window. */
    public data object Deduplicated : NotificationToastDecision

    /** The user turned this notification type's toggle off — no in-app banner. */
    public data object BlockedByPreferences : NotificationToastDecision
}

/**
 * Pure decision core for the in-app real-time notification toast (feature-parity §M) — a faithful
 * port of iOS's in-app banner rule (`NotificationToastManager.handleNewNotification` +
 * `UserNotificationPreferences.allowsInAppBanner`).
 *
 * The gates, in iOS's order:
 *  1. **Active screen** — the notification's conversation/post is the one already on screen (its
 *     content is being consumed live), so it never re-announces itself ([ActiveContextMatch]).
 *     This is the one suppression the caller owns and no preference carries.
 *  2. **Dedup** — the socket `notification:new` and an APN can fire for the same event within
 *     milliseconds; the banner must appear exactly once ([isDuplicateDelivery]).
 *  3. **Per-type toggle** — [NotificationTypeToggle], the switch Settings ▸ Notifications promises
 *     to honour. A disabled type yields [NotificationToastDecision.BlockedByPreferences]; a
 *     toggle-less type (translation, gamification, …) passes, exactly as iOS treats them.
 *
 * **`pushEnabled` and the Do-Not-Disturb window are deliberately NOT applied here**, matching iOS
 * `allowsInAppBanner`'s documented reasoning: those two filters protect the attention of an
 * ABSENT user (background push, lock screen). Here the user has the app open in front of them —
 * cutting push off asks not to be interrupted OUTSIDE the app, not to go blind INSIDE it, and the
 * DND window is the same protection carried to its conclusion. They still gate the FOREGROUND
 * push banner ([PushPresentationPolicy], which owns `pushEnabled` + [DndWindow] for the surface
 * that actually needs them); re-applying them here both over-suppressed the present user and made
 * the per-type toggles the only thing the in-app surface honoured — the amalgam iOS's own
 * doc-comment warns against restoring.
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
        if (!NotificationTypeToggle.isEnabled(notification.type, preferences)) {
            return NotificationToastDecision.BlockedByPreferences
        }
        return NotificationToastDecision.Show(notification)
    }
}
