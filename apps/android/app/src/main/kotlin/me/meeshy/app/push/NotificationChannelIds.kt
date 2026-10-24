package me.meeshy.app.push

import me.meeshy.sdk.model.push.PushChannelCategory

/**
 * Canonical Android notification-channel identifiers (ARCHITECTURE.md §18 — "~80
 * notification types map onto a curated notification-channel taxonomy"). Single
 * source of truth shared by [MeeshyFcmService] (the explicit `notify()` call paths)
 * and [NotificationChannelInstaller] (eager creation at process start).
 *
 * [CHANNEL_MESSAGES] MUST stay byte-for-byte in sync with the `channelId` the
 * gateway already sends for every Android non-call push
 * (`services/gateway/src/services/PushNotificationService.ts` `sendViaFCM`,
 * `message.android.notification.channelId`). That matters because a push carrying
 * both a `notification` and a `data` block — every non-call push today — is
 * auto-rendered by the OS/Play services when the app is backgrounded or killed:
 * `MeeshyFcmService.onMessageReceived` never runs in that case, so the system posts
 * directly against this id. A client that only ever creates a differently-named
 * channel (the former `meeshy_messages`), and only lazily inside a handler that
 * doesn't run in that exact scenario, leaves the id the gateway targets
 * unregistered on the device precisely when push delivery matters most — the
 * notification is then either dropped or folded into a generic, unbranded system
 * fallback channel, neither of which is the curated per-category channel this
 * architecture line calls for. Renamed to close that drift; the former id is kept
 * as [LEGACY_CHANNEL_MESSAGES] so an existing install's stale channel can be
 * deleted (channels are immutable once created — same "delete + recreate under a
 * new id" migration [CHANNEL_CALLS] already took from `meeshy_calls` v1 to v2).
 */
object NotificationChannelIds {
    const val CHANNEL_MESSAGES: String = "meeshy_notifications"
    const val LEGACY_CHANNEL_MESSAGES: String = "meeshy_messages"

    /** v2 : les canaux sont immuables — le v1 (muet, sans sonnerie) est supprimé au passage. */
    const val CHANNEL_CALLS: String = "meeshy_calls_v2"
    const val LEGACY_CHANNEL_CALLS: String = "meeshy_calls"

    /** Social family : likes, comments, stories, contacts, communities, game. */
    const val CHANNEL_SOCIAL: String = "meeshy_social"

    /** Account family : security alerts, reports, service messages. */
    const val CHANNEL_SYSTEM: String = "meeshy_system"

    /**
     * Quiet delivery (no banner, no sound) — where a push lands when the preferences refuse an
     * alert in the background (quiet hours, muted type, system Do-Not-Disturb), the
     * counterpart of the iOS `.passive` interruption level.
     */
    const val CHANNEL_SILENT: String = "meeshy_notifications_silent"

    /**
     * The channel of a category. Messages and every unknown type stay on [CHANNEL_MESSAGES]
     * — the id the gateway targets, so a historic install keeps its user-tuned channel.
     */
    fun forCategory(category: PushChannelCategory): String = when (category) {
        PushChannelCategory.MESSAGES -> CHANNEL_MESSAGES
        PushChannelCategory.SOCIAL -> CHANNEL_SOCIAL
        PushChannelCategory.SYSTEM -> CHANNEL_SYSTEM
    }
}
