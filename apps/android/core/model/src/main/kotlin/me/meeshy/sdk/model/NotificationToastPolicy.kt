package me.meeshy.sdk.model

/** What a real-time `notification:new` event should do to the in-app toast (feature-parity §M). */
public sealed interface NotificationToastDecision {
    /** Surface [notification] as a toast. */
    public data class Show(val notification: ApiNotification) : NotificationToastDecision

    /** The notification's conversation is open in some window — consumed silently. */
    public data object SuppressedActiveScreen : NotificationToastDecision

    /** A duplicate delivery (APN + socket racing for the same event) within the dedup window. */
    public data object Deduplicated : NotificationToastDecision

    /** This type's per-type toggle is off. */
    public data object BlockedByPreferences : NotificationToastDecision
}

/**
 * Pure decision core for the in-app real-time notification banner — iOS `allowsInAppBanner` +
 * the conversation-open guard of `handleNewNotification`.
 *
 * **La bannière a sa propre règle, plus permissive que celle du push.** `pushEnabled` et la
 * fenêtre Ne pas déranger protègent l'attention de l'utilisateur ABSENT ; ici il est devant
 * l'écran, donc seuls restent : la conversation ouverte (dans N'IMPORTE QUELLE fenêtre — un
 * ENSEMBLE d'ids), le dédoublonnage (précalculé par l'appelant, [ToastDedupWindow]) et
 * l'interrupteur PAR TYPE ([NotificationTypeToggle.isEnabled]). Un post ou une story à l'écran ne
 * supprime plus rien : la conversation ouverte est la seule exception produit.
 */
public object NotificationToastPolicy {

    public fun decide(
        notification: ApiNotification,
        openConversationIds: Set<String>,
        isDuplicateDelivery: Boolean,
        preferences: UserNotificationPreferences,
    ): NotificationToastDecision {
        if (ActiveContextMatch.matchesOpenConversation(notification.context?.conversationId, openConversationIds)) {
            return NotificationToastDecision.SuppressedActiveScreen
        }
        if (isDuplicateDelivery) return NotificationToastDecision.Deduplicated
        if (!NotificationTypeToggle.isEnabled(notification.type, preferences)) {
            return NotificationToastDecision.BlockedByPreferences
        }
        return NotificationToastDecision.Show(notification)
    }
}
