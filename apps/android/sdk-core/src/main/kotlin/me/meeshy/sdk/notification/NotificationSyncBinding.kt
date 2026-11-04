package me.meeshy.sdk.notification

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/**
 * Wires the notification-sync socket family (the four
 * lifecycle events — read, read-bulk, deleted, deleted-bulk — and the
 * server-authoritative `notification:counts`; `notification:new` now enters through
 * [NotificationIngestPipeline] only) into [NotificationRepository]'s
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

/**
 * Le pendant « consommation » du câblage socket : les mêmes six événements, mais lus par
 * [NotificationConsumptionService], qui connaît le registre d'auto-lecture — l'écho d'une action de CET appareil ne
 * décrémente pas deux fois, l'écho d'un autre s'applique, et les vues montées sont republiées. Les mutations de
 * [observeNotificationSync] restent idempotentes : les deux câblages cohabitent sans double décompte.
 */
@Singleton
class NotificationConsumptionSocketBinding @Inject constructor(
    private val messageSocketManager: MessageSocketManager,
    private val consumption: NotificationConsumptionService,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        guarded(live, messageSocketManager.notificationRead) { consumption.onSocketRead(it.notificationId) }
        guarded(live, messageSocketManager.notificationReadBulk) { consumption.onSocketReadBulk(it.scope) }
        guarded(live, messageSocketManager.notificationDeleted) { consumption.onSocketDeleted(it.notificationId) }
        guarded(live, messageSocketManager.notificationDeletedBulk) { consumption.onSocketDeletedBulk(it.scope) }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }

    private fun <T> guarded(live: CoroutineScope, flow: Flow<T>, handle: (T) -> Unit) {
        flow.onEach {
            try {
                handle(it)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Timber.e(e, "Écho de notification en échec")
            }
        }.launchIn(live)
    }
}
