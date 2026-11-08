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
import me.meeshy.sdk.model.playback.VoicePlaybackCardOwner
import me.meeshy.sdk.model.playback.VoicePlaybackCardOwnership
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.model.playback.VoicePlaybackQueueControls
import me.meeshy.sdk.model.playback.VoicePlaybackTransportState
import me.meeshy.ui.component.audio.VoicePlaybackHost

/**
 * Ce qu'un publieur a remis, et l'instant (horloge monotone) où il l'a fait : la barre s'extrapole depuis cet ancrage.
 * [controls] est `null` pour le lecteur d'un écran (aucune file), renseigné par le moteur partagé.
 */
internal data class VoicePlaybackSnapshot(
    val card: VoicePlaybackCard,
    val transport: VoicePlaybackTransportState,
    val anchorMillis: Long,
    val controls: VoicePlaybackQueueControls? = null,
)

/**
 * Le pont entre les lecteurs de vocaux et la session système ([VoicePlaybackService]). Deux publieurs :
 * le lecteur d'un écran (`ChatAudioPlayer`, via [VoicePlaybackHost]) et le moteur partagé qui survit à
 * l'écran ([SharedAudioSessionPublisher]). Le système n'a qu'UNE carte : [VoicePlaybackCardOwnership]
 * l'attribue au dernier qui joue et fait taire l'autre ; les ordres de la notification, de l'écran
 * verrouillé et du casque ne vont qu'à son propriétaire.
 */
@Singleton
internal class VoicePlaybackSessionBridge(
    private val clock: () -> Long,
) : VoicePlaybackHost {

    @Inject
    constructor() : this(SystemClock::elapsedRealtime)

    private val screenSignal = commandSignal()
    private val sharedSignal = commandSignal()
    private val current = MutableStateFlow<VoicePlaybackSnapshot?>(null)
    private var owner: VoicePlaybackCardOwner? = null

    /** Les ordres du système pour le lecteur de l'écran. */
    override val commands: Flow<VoicePlaybackCommand> get() = screenSignal

    /** Les ordres du système pour le moteur partagé. */
    val sharedCommands: Flow<VoicePlaybackCommand> get() = sharedSignal

    val snapshot: StateFlow<VoicePlaybackSnapshot?> = current.asStateFlow()

    override fun publish(card: VoicePlaybackCard, transport: VoicePlaybackTransportState) =
        publish(VoicePlaybackCardOwner.Screen, card, transport, controls = null)

    override fun retire() = retire(VoicePlaybackCardOwner.Screen)

    fun publishShared(card: VoicePlaybackCard, transport: VoicePlaybackTransportState, controls: VoicePlaybackQueueControls) =
        publish(VoicePlaybackCardOwner.Shared, card, transport, controls)

    fun retireShared() = retire(VoicePlaybackCardOwner.Shared)

    /** Un ordre venu du système, remis au propriétaire de la carte (à l'écran tant que personne ne la tient). */
    fun dispatch(command: VoicePlaybackCommand) {
        val target = synchronized(this) { VoicePlaybackCardOwnership.routeTo(owner) }
        signalOf(target).tryEmit(command)
    }

    private fun publish(
        by: VoicePlaybackCardOwner,
        card: VoicePlaybackCard,
        transport: VoicePlaybackTransportState,
        controls: VoicePlaybackQueueControls?,
    ) {
        val silenced = synchronized(this) {
            val decision = VoicePlaybackCardOwnership.publish(owner, by, active = transport.isPlaying || transport.isBuffering)
            owner = decision.owner
            if (decision.owner == by) current.value = VoicePlaybackSnapshot(card, transport, clock(), controls)
            decision.silence
        }
        silenced?.let { signalOf(it).tryEmit(VoicePlaybackCommand.Stop) }
    }

    private fun retire(by: VoicePlaybackCardOwner) {
        synchronized(this) {
            owner = VoicePlaybackCardOwnership.retire(owner, by)
            if (owner == null) current.value = null
        }
    }

    private fun signalOf(target: VoicePlaybackCardOwner) = when (target) {
        VoicePlaybackCardOwner.Screen -> screenSignal
        VoicePlaybackCardOwner.Shared -> sharedSignal
    }

    private companion object {
        const val COMMAND_BUFFER = 8

        fun commandSignal() = MutableSharedFlow<VoicePlaybackCommand>(
            extraBufferCapacity = COMMAND_BUFFER,
            onBufferOverflow = BufferOverflow.DROP_OLDEST,
        )
    }
}
