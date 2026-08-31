package me.meeshy.sdk.model

import java.time.LocalDateTime

/**
 * What a FOREGROUND FCM push should do to the system notification tray (feature-parity §M).
 *
 * Android only calls `FirebaseMessagingService.onMessageReceived` for a `notification`-payload
 * push while the app is in the foreground (a backgrounded app has the system post it directly),
 * so this decision governs exactly the iOS `willPresent` moment.
 */
public sealed interface PushPresentationDecision {

    /**
     * Do not raise a system banner: the thread is already on screen, the socket toast covers it,
     * or the user's preferences (push master / quiet hours / this type's toggle) forbid it.
     */
    public data object Suppress : PushPresentationDecision

    /** Raise the system banner, playing a sound only when [playSound]. */
    public data class Alert(val playSound: Boolean) : PushPresentationDecision
}

/**
 * Pure decision core for a FOREGROUND push banner — the Android counterpart of iOS
 * `NotificationPresentationResolver.options`. Before it, [me.meeshy.sdk.model] had a gate for the
 * in-app toast ([NotificationToastPolicy]) but the FCM message path raised a system banner for
 * EVERY foreground push with no gate at all: push disabled, inside quiet hours, a type the user
 * muted, or the very conversation on screen still buzzed.
 *
 * The rules, applied in order (first match wins):
 *  1. **On-screen thread** — a push for the conversation being read never doubles what the reader
 *     already sees (the system pendant of the toast's active-screen suppression).
 *  2. **Socket alive** — the realtime socket is delivering the same event, and the in-app toast
 *     ([NotificationToastPolicy]) surfaces it; a system banner on top would be a duplicate. Only
 *     when the socket is DOWN is the push the sole delivery worth a banner.
 *  3. **Preference gate (socket down only)** — the push is now the only delivery, so it is gated
 *     exactly as a background push would be: [UserNotificationPreferences.pushEnabled] (the push
 *     master), the quiet-hours window ([DndWindow.isActive]), then the per-type toggle
 *     ([NotificationTypeToggle.isEnabled]). Any failing ⇒ [PushPresentationDecision.Suppress].
 *
 * When a banner IS raised, its sound follows [UserNotificationPreferences.soundEnabled] — the
 * banner's iOS `.sound` option. iOS's `.badge` presentation option has no Android analog (the
 * app-icon badge is a side effect of a posted notification, not an independent option), so it is
 * deliberately not modelled here; suppression withholds the whole banner, badge included.
 *
 * The wall clock is passed in ([now]) so every branch stays deterministically testable, mirroring
 * [NotificationToastPolicy] and [DndWindow].
 */
public object PushPresentationPolicy {

    public fun decide(
        socketConnected: Boolean,
        preferences: UserNotificationPreferences,
        rawType: String?,
        conversationId: String?,
        activeConversationId: String?,
        now: LocalDateTime,
    ): PushPresentationDecision {
        if (conversationId != null && conversationId == activeConversationId) {
            return PushPresentationDecision.Suppress
        }
        if (socketConnected) return PushPresentationDecision.Suppress
        if (!preferences.pushEnabled) return PushPresentationDecision.Suppress
        if (DndWindow.isActive(preferences, now)) return PushPresentationDecision.Suppress
        if (!NotificationTypeToggle.isEnabled(rawType.orEmpty(), preferences)) {
            return PushPresentationDecision.Suppress
        }
        return PushPresentationDecision.Alert(playSound = preferences.soundEnabled)
    }
}
