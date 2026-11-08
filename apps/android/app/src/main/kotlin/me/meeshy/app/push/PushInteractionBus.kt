package me.meeshy.app.push

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Ce que l'utilisateur fait d'une bannière de push : elle est affichée, touchée (ouverte) ou
 * balayée. Le seul canal que l'entonnoir de mesure (lot ultérieur) écoute : aucune de ces
 * issues ne marque la notification lue à elle seule.
 */
sealed interface PushInteraction {
    val notificationId: String?

    data class Displayed(override val notificationId: String?) : PushInteraction
    data class Opened(override val notificationId: String?) : PushInteraction
    data class Dismissed(override val notificationId: String?) : PushInteraction
}

@Singleton
class PushInteractionBus @Inject constructor() {
    private val mutableEvents = MutableSharedFlow<PushInteraction>(extraBufferCapacity = BUFFER, onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST)

    val events: SharedFlow<PushInteraction> = mutableEvents.asSharedFlow()

    fun emit(interaction: PushInteraction): Boolean = mutableEvents.tryEmit(interaction)

    private companion object {
        const val BUFFER = 64
    }
}
