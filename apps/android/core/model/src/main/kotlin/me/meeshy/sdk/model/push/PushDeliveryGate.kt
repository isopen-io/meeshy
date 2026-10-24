package me.meeshy.sdk.model.push

import me.meeshy.sdk.model.FocusFilterSnapshot
import me.meeshy.sdk.model.NotificationPreferencesFilter
import me.meeshy.sdk.model.UserNotificationPreferences
import java.time.LocalDateTime

/** What the push pipeline does with one decoded push. */
public sealed interface PushDelivery {

    /** Nothing is posted : the thread is on screen, or the live socket already serves the in-app toast. */
    public data object Suppress : PushDelivery

    /**
     * Posted quietly (silent channel : no banner, no sound) — the preferences refuse an alert
     * while the app is in the background. Mirror of the iOS NSE's `.passive` delivery : the
     * notification still lands in the tray, it just does not interrupt.
     */
    public data object Passive : PushDelivery

    /** A full alert, playing a sound only when [playSound]. */
    public data class Alert(val playSound: Boolean) : PushDelivery
}

/** Everything the gate reads besides the payload, sampled at reception. */
public data class PushDeliveryContext(
    val appInForeground: Boolean,
    val socketConnected: Boolean,
    val activeConversationId: String?,
    val preferences: UserNotificationPreferences,
    val focus: FocusFilterSnapshot = FocusFilterSnapshot.PERMISSIVE,
    val now: LocalDateTime,
)

/**
 * The single delivery gate of the push pipeline — iOS `NSEPreferencesGate` (background) and
 * `NotificationPresentationResolver` (foreground) in one pure rule. Order, first match wins :
 *  1. the conversation OPEN on screen (foreground only) ⇒ [PushDelivery.Suppress] ;
 *  2. the live socket (foreground only : a background socket is never trusted) ⇒ Suppress ;
 *  3. push master, quiet hours, per-type toggle, Focus ([NotificationPreferencesFilter]) —
 *     a refusal suppresses in the foreground (exactly as before) and goes passive in the
 *     background (the notification lands silently in the tray, like iOS).
 */
public object PushDeliveryGate {

    public fun decide(payload: PushPayload, context: PushDeliveryContext): PushDelivery {
        if (context.appInForeground) {
            val conversationId = payload.conversationId
            if (conversationId != null && conversationId == context.activeConversationId) return PushDelivery.Suppress
            if (context.socketConnected) return PushDelivery.Suppress
        }
        val allowed = NotificationPreferencesFilter.allowsNotification(
            preferences = context.preferences,
            rawType = payload.type,
            isDirectConversation = payload.isDirectConversation,
            focus = context.focus,
            at = context.now,
        )
        return when {
            allowed -> PushDelivery.Alert(playSound = context.preferences.soundEnabled)
            context.appInForeground -> PushDelivery.Suppress
            else -> PushDelivery.Passive
        }
    }
}
