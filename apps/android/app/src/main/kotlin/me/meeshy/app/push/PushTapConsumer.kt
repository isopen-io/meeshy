package me.meeshy.app.push

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.notification.NotificationRepository
import timber.log.Timber
import javax.inject.Inject

/**
 * La suite d'un toucher de push, une fois la navigation faite : l'ouverture part sur le bus,
 * PUIS la notification serveur est marquée lue (`notificationId` — couvre aussi les types sans
 * écran : alerte de sécurité, nouvel appareil, demande d'ami). Sans identifiant, on n'y touche pas.
 */
class PushTapConsumer(
    private val bus: PushInteractionBus,
    private val markAsRead: suspend (String) -> Unit,
    private val scope: CoroutineScope,
) {
    @Inject
    constructor(bus: PushInteractionBus, notifications: NotificationRepository) : this(
        bus = bus,
        markAsRead = { notifications.markAsRead(it) },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    fun onNavigated(notificationId: String?): Job? {
        val id = notificationId?.takeIf { it.isNotBlank() }
        bus.emit(PushInteraction.Opened(id))
        id ?: return null
        return scope.launch {
            try {
                markAsRead(id)
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.w(failure, "Marking the tapped notification read failed")
            }
        }
    }
}
