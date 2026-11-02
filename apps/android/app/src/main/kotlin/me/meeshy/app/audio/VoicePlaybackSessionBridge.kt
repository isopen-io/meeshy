package me.meeshy.app.audio

import android.os.SystemClock
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.playback.VoicePlaybackCard
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState
import me.meeshy.ui.component.audio.VoicePlaybackHost

/** Ce que le lecteur a publié, et l'instant (horloge monotone) où il l'a fait : la barre s'extrapole depuis cet ancrage. */
internal data class VoicePlaybackSnapshot(
    val card: VoicePlaybackCard,
    val transport: VoicePlaybackTransportState,
    val anchorMillis: Long,
)

/**
 * Le pont entre le lecteur de vocaux d'un écran (`ChatAudioPlayer`) et la session système
 * ([VoicePlaybackService]) : le lecteur PUBLIE sa carte, le service la peint et lui renvoie les ordres
 * de la notification, de l'écran verrouillé et du casque. Aucun lecteur natif n'est rouvert côté
 * service — l'écran reste le SEUL moteur, comme la page dans la coque `apps/web/android`.
 */
@Singleton
internal class VoicePlaybackSessionBridge(
    private val clock: () -> Long,
) : VoicePlaybackHost {

    @Inject
    constructor() : this(SystemClock::elapsedRealtime)

    private val commandSignal = MutableSharedFlow<VoicePlaybackCommand>(
        extraBufferCapacity = COMMAND_BUFFER,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    private val current = MutableStateFlow<VoicePlaybackSnapshot?>(null)

    override val commands: Flow<VoicePlaybackCommand> get() = commandSignal

    val snapshot: StateFlow<VoicePlaybackSnapshot?> = current.asStateFlow()

    override fun publish(card: VoicePlaybackCard, transport: VoicePlaybackTransportState) {
        current.value = VoicePlaybackSnapshot(card, transport, clock())
    }

    override fun retire() {
        current.value = null
    }

    /** Un ordre venu du système, remis au lecteur de l'écran. */
    fun dispatch(command: VoicePlaybackCommand) {
        commandSignal.tryEmit(command)
    }

    private companion object {
        const val COMMAND_BUFFER = 8
    }
}
