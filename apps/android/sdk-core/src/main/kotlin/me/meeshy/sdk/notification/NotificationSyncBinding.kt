package me.meeshy.sdk.notification

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * Wires the notification-sync socket family (`notification:new` plus the four
 * lifecycle events — read, read-bulk, deleted, deleted-bulk — and the
 * server-authoritative `notification:counts`) into [NotificationRepository]'s
 * shared cache. Factored out of `NotificationsViewModel` (notif-sync) because
 * [MessageSocketManager]'s flows are `SharedFlow`s with `replay = 0`: a caller
 * whose collector is scoped to a screen only sees events that arrive while
 * that screen is open, and everything else is dropped — including the events
 * that move [NotificationRepository.unreadCountStream], which the badge in
 * the app's chrome reads regardless of which screen is open. Any caller
 * scoped for the app's lifetime (not a single screen) must invoke this too so
 * the badge and every other cache consumer stay live off-screen.
 *
 * Every mutation applied here is idempotent by id/predicate (see
 * [NotificationRepository]'s doc-comments), so calling this from more than
 * one scope at once (e.g. both an app-scoped chrome ViewModel and the
 * notifications screen's own ViewModel while it is open) is safe — a
 * duplicate application of the same event is a no-op, never a double count.
 */
fun CoroutineScope.observeNotificationSync(
    notificationRepository: NotificationRepository,
    messageSocketManager: MessageSocketManager,
) {
    messageSocketManager.notificationReceived
        .onEach { notificationRepository.prependLive(it) }
        .launchIn(this)
    messageSocketManager.notificationRead
        .onEach { notificationRepository.applyRead(it.notificationId) }
        .launchIn(this)
    messageSocketManager.notificationReadBulk
        .onEach { notificationRepository.applyReadBulk(it.scope) }
        .launchIn(this)
    messageSocketManager.notificationDeleted
        .onEach { notificationRepository.applyDeleted(it.notificationId) }
        .launchIn(this)
    messageSocketManager.notificationDeletedBulk
        .onEach { notificationRepository.applyDeletedBulk(it.scope) }
        .launchIn(this)
    messageSocketManager.notificationCounts
        .onEach { notificationRepository.applyCounts(it.unread) }
        .launchIn(this)
}
