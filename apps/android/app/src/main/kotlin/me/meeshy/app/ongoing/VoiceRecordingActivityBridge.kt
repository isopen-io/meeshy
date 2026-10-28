package me.meeshy.app.ongoing

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.ui.component.recording.VoiceRecordingHost
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le pont entre l'enregistreur du composeur et la notification « enregistrement en cours » :
 * l'écran PUBLIE le début de sa prise (puis la retire) et reçoit les boutons « Arrêter » et
 * « Annuler » de la notification. Aucun moteur audio ici — l'écran reste le seul à toucher le micro.
 */
@Singleton
internal class VoiceRecordingActivityBridge @Inject constructor() : VoiceRecordingHost {

    private val current = MutableStateFlow<Long?>(null)
    private val stops = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /** Le début de la prise en cours (epoch ms), ou `null` quand le micro est fermé. */
    val startedAt: StateFlow<Long?> = current.asStateFlow()

    private val cancels = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    @Volatile
    private var keptAlive = false

    override val stopRequests: Flow<Unit> get() = stops

    override val cancelRequests: Flow<Unit> get() = cancels

    override val keepsRecordingInBackground: Boolean get() = keptAlive

    /** Posé par la notification : le service de premier plan tient (ou ne tient plus) le micro. */
    fun setKeepsRecordingInBackground(value: Boolean) {
        keptAlive = value
    }

    override fun publish(startedAtEpochMs: Long) {
        current.value = startedAtEpochMs
    }

    override fun retire() {
        current.value = null
    }

    /** Le bouton « Arrêter » de la notification. */
    fun requestStop() {
        stops.tryEmit(Unit)
    }

    /** Le bouton « Annuler » de la notification. */
    fun requestCancel() {
        cancels.tryEmit(Unit)
    }
}
