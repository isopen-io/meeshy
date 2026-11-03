package me.meeshy.sdk.playback

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.AudioPlayQueue
import me.meeshy.sdk.model.CoordinatorSpeedCycle
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.session.PerAccountCache
import timber.log.Timber

/** La conversation jouée : ce que le mini-lecteur et la notification décrivent (iOS `ActiveAudioContext`). */
public data class ActiveAudioContext(
    val audio: QueuedAudio,
    val conversationName: String,
    val conversationArtworkUrl: String?,
    /** Accent de la conversation (hex), passé par l'appelant qui seul le calcule. */
    val accentHex: String? = null,
)

/** Un vocal écouté jusqu'au bout (ou passé parce que cassé) : la conversation le marque écouté. */
public data class AttachmentFinishedEvent(val attachmentId: String, val conversationId: String, val completed: Boolean)

public data class CoordinatorSnapshot(
    val queue: AudioPlayQueue = AudioPlayQueue(),
    val context: ActiveAudioContext? = null,
)

/**
 * **Le coordinateur unique de lecture** (iOS `ConversationAudioCoordinator`) : possède la file des
 * vocaux d'une conversation et UN moteur. Enchaîne les pistes (suivant/précédent, auto-avance),
 * cycle la vitesse ×1 / ×1,5 / ×2, publie le contexte actif et les vocaux terminés.
 *
 * Un moteur dont la lecture échoue passe au vocal suivant au lieu de bloquer la file.
 */
public class ConversationAudioCoordinator(
    private val engine: AudioPlaybackEngine,
    private val dispatcher: CoroutineDispatcher,
) : PerAccountCache {

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val mutableSnapshot = MutableStateFlow(CoordinatorSnapshot())
    private val mutableFinished = MutableSharedFlow<AttachmentFinishedEvent>(extraBufferCapacity = 16)

    public val snapshot: StateFlow<CoordinatorSnapshot> = mutableSnapshot.asStateFlow()
    public val attachmentFinished: SharedFlow<AttachmentFinishedEvent> = mutableFinished.asSharedFlow()

    init {
        scope.launch {
            engine.events.collect { event ->
                try {
                    if (event is AudioEngineEvent.Finished) onFinished(event)
                } catch (failure: Exception) {
                    Timber.e(failure, "Coordinateur audio : fin de piste mal traitée")
                }
            }
        }
    }

    /** Joue [current] puis [tail] ; un refus de la garde d'appel laisse tout en l'état. */
    public fun play(
        current: QueuedAudio,
        tail: List<QueuedAudio>,
        conversationName: String,
        conversationArtworkUrl: String?,
        accentHex: String? = null,
    ) {
        val accepted = engine.play(current.attachmentId, current.fileUrl, PlaybackCommandOrigin.InApp)
        if (!accepted) return
        val queue = mutableSnapshot.value.queue.started(current, tail)
        mutableSnapshot.value = CoordinatorSnapshot(
            queue = queue,
            context = ActiveAudioContext(current, conversationName, conversationArtworkUrl, accentHex),
        )
    }

    /** Un vocal arrivé dans la conversation jouée rejoint la fin de la file. */
    public fun appendUpcoming(item: QueuedAudio) {
        val current = mutableSnapshot.value
        if (current.context?.audio?.conversationId != item.conversationId) return
        mutableSnapshot.value = current.copy(queue = current.queue.appended(item))
    }

    public fun togglePlayPause(origin: PlaybackCommandOrigin = PlaybackCommandOrigin.InApp) =
        engine.togglePlayPause(origin)

    public fun next(origin: PlaybackCommandOrigin = PlaybackCommandOrigin.InApp) {
        val snapshot = mutableSnapshot.value
        if (!snapshot.queue.hasNext) {
            stop()
            return
        }
        switchTo(snapshot.queue.advanced(), origin)
    }

    /** Au-delà de [RESTART_THRESHOLD_MS] de lecture, « précédent » recommence le vocal ; sinon il recule. */
    public fun previous(origin: PlaybackCommandOrigin = PlaybackCommandOrigin.InApp) {
        val snapshot = mutableSnapshot.value
        if (!snapshot.queue.hasPrevious || engine.state.value.currentTimeMs > RESTART_THRESHOLD_MS) {
            engine.seekToMs(0L)
            return
        }
        switchTo(snapshot.queue.rewound(), origin)
    }

    public fun cycleSpeed() = engine.setSpeed(CoordinatorSpeedCycle.next(engine.state.value.speed))

    public fun stop() {
        engine.stop()
        mutableSnapshot.value = CoordinatorSnapshot()
    }

    /** Le message est supprimé : s'il est joué, on passe au suivant ; ses vocaux quittent la file. */
    public fun onMessageDeleted(messageId: String) {
        val snapshot = mutableSnapshot.value
        val playing = snapshot.queue.current?.messageId == messageId
        val cleaned = snapshot.queue.withoutMessage(messageId)
        if (!playing) {
            mutableSnapshot.value = snapshot.copy(queue = cleaned)
            return
        }
        if (cleaned.upcoming.isEmpty()) {
            stop()
            return
        }
        switchTo(cleaned.advanced(), PlaybackCommandOrigin.Automatic)
    }

    /** Déconnexion : plus rien ne joue, plus rien ne reste. */
    override suspend fun clear() = withContext(dispatcher) { stop() }

    private fun switchTo(queue: AudioPlayQueue, origin: PlaybackCommandOrigin) {
        val target = queue.current ?: return stop()
        if (!engine.play(target.attachmentId, target.fileUrl, origin)) return
        mutableSnapshot.value = mutableSnapshot.value.let { it.copy(queue = queue, context = it.context?.copy(audio = target)) }
    }

    private fun onFinished(event: AudioEngineEvent.Finished) {
        val snapshot = mutableSnapshot.value
        val finished = snapshot.queue.current?.takeIf { it.attachmentId == event.attachmentId } ?: return
        mutableFinished.tryEmit(AttachmentFinishedEvent(finished.attachmentId, finished.conversationId, event.completed))
        if (snapshot.queue.hasNext) {
            switchTo(snapshot.queue.advanced(), PlaybackCommandOrigin.Automatic)
            // Une garde d'appel qui refuse l'enchaînement laisse la file au vocal terminé : on la vide.
            if (mutableSnapshot.value.queue.current?.attachmentId == finished.attachmentId) mutableSnapshot.value = CoordinatorSnapshot()
        } else {
            mutableSnapshot.value = CoordinatorSnapshot()
        }
    }

    private companion object {
        const val RESTART_THRESHOLD_MS = 3_000L
    }
}
