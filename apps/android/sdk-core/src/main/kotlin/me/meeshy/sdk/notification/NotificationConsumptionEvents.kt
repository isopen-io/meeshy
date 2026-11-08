package me.meeshy.sdk.notification

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.sdk.model.NotificationReadScope

/**
 * Les canaux par lesquels une consommation se REPUBLIE vers les vues montées — miroir des sujets de
 * `NotificationToastManager` iOS (`notificationMarkedRead`, `conversationNotificationsRead`, …). Le cache durable est
 * patché en silence ; une vue qui garde sa propre copie se repeint depuis ces flux.
 */
@Singleton
class NotificationConsumptionEvents @Inject constructor() {

    private fun <T> channel() = MutableSharedFlow<T>(extraBufferCapacity = BUFFER, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    private val _notificationMarkedRead = channel<String>()
    private val _conversationNotificationsRead = channel<String>()
    private val _postNotificationsRead = channel<String>()
    private val _typeNotificationsRead = channel<List<String>>()
    private val _allNotificationsRead = channel<Unit>()
    private val _notificationReadRolledBack = channel<NotificationReadScope>()
    private val _notificationWasDeleted = channel<String>()

    val notificationMarkedRead: SharedFlow<String> = _notificationMarkedRead.asSharedFlow()
    val conversationNotificationsRead: SharedFlow<String> = _conversationNotificationsRead.asSharedFlow()
    val postNotificationsRead: SharedFlow<String> = _postNotificationsRead.asSharedFlow()
    val typeNotificationsRead: SharedFlow<List<String>> = _typeNotificationsRead.asSharedFlow()
    val allNotificationsRead: SharedFlow<Unit> = _allNotificationsRead.asSharedFlow()

    /** Le serveur a refusé un marquage optimiste : la portée repasse non lue (un toast peut le dire). */
    val notificationReadRolledBack: SharedFlow<NotificationReadScope> = _notificationReadRolledBack.asSharedFlow()
    val notificationWasDeleted: SharedFlow<String> = _notificationWasDeleted.asSharedFlow()

    /** Republie « cette portée est lue » sur le canal qui lui correspond. */
    fun publishRead(scope: NotificationReadScope) {
        when (scope) {
            is NotificationReadScope.Single -> _notificationMarkedRead.tryEmit(scope.id)
            is NotificationReadScope.Conversation -> _conversationNotificationsRead.tryEmit(scope.id)
            is NotificationReadScope.Post -> _postNotificationsRead.tryEmit(scope.id)
            is NotificationReadScope.Types -> _typeNotificationsRead.tryEmit(scope.types)
            NotificationReadScope.All -> _allNotificationsRead.tryEmit(Unit)
        }
    }

    fun publishRolledBack(scope: NotificationReadScope) {
        _notificationReadRolledBack.tryEmit(scope)
    }

    fun publishDeleted(notificationId: String) {
        _notificationWasDeleted.tryEmit(notificationId)
    }

    private companion object {
        const val BUFFER = 64
    }
}
