package me.meeshy.sdk.model

import java.time.LocalDateTime

/**
 * Client-side filtering rules for a notification against the user's
 * [UserNotificationPreferences] — port of iOS `UserNotificationPreferences+Filter.swift`
 * (`allowsNotification` / `allowsInAppBanner`). The gateway filters too ; the client
 * double-checks so a toggle is effective at once (no wait for sync) and the quiet hours
 * follow the user's local clock.
 */
public object NotificationPreferencesFilter {

    /**
     * Whether a notification of wire [rawType] may surface as a BACKGROUND alert (system
     * banner, sound, lock screen). Order, first refusal wins : push master, then the
     * quiet-hours window, then the per-type toggle, then the Focus / system Do-Not-Disturb
     * table ([focus] is permissive when absent).
     */
    public fun allowsNotification(
        preferences: UserNotificationPreferences,
        rawType: String?,
        isDirectConversation: Boolean = false,
        focus: FocusFilterSnapshot = FocusFilterSnapshot.PERMISSIVE,
        at: LocalDateTime,
    ): Boolean {
        if (!preferences.pushEnabled) return false
        if (DndWindow.isActive(preferences, at)) return false
        if (!NotificationTypeToggle.isEnabled(rawType.orEmpty(), preferences)) return false
        return focus.allows(rawType, isDirectConversation)
    }

    /**
     * Whether a notification may surface as an IN-APP banner : the user is looking at the
     * app, so only the per-type toggles apply — never the push master, the quiet hours or
     * the Focus (they protect the attention of an ABSENT user).
     */
    public fun allowsInAppBanner(preferences: UserNotificationPreferences, rawType: String?): Boolean =
        NotificationTypeToggle.isEnabled(rawType.orEmpty(), preferences)
}
