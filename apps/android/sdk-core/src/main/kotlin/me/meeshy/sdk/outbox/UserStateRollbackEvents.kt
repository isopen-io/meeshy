package me.meeshy.sdk.outbox

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Le geste sur l'état d'une conversation (épingler, couper le son, archiver…) n'a pas pu partir et sa ligne a été
 * restaurée : l'écran en informe l'utilisateur (message de retour). [conversationId] désigne la ligne restaurée.
 */
public data class UserStateRollback(val conversationId: String)

/** Le canal des retours arrière d'état utilisateur, émis par le gestionnaire de l'instantané de préférences. */
@Singleton
public class UserStateRollbackEvents @Inject constructor() {
    private val flow = MutableSharedFlow<UserStateRollback>(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    public val events: SharedFlow<UserStateRollback> = flow.asSharedFlow()

    public fun emit(conversationId: String) {
        flow.tryEmit(UserStateRollback(conversationId))
    }
}
