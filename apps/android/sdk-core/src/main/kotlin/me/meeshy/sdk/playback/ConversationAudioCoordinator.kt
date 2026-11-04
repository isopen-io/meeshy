package me.meeshy.sdk.playback

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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
import me.meeshy.sdk.model.media.LocalFileUrl
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.model.playback.PreviousStep
import me.meeshy.sdk.model.playback.QueueStepRule
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

    private val mutableGrace = MutableStateFlow<ActiveAudioContext?>(null)
    private var graceJob: Job? = null

    /** L'état du moteur (progression, vitesse, lecture) tel que les bulles actives et le mini-lecteur le lisent. */
    public val playback: StateFlow<me.meeshy.sdk.model.playback.AudioPlaybackState> get() = engine.state

    /**
     * Après épuisement de la file, le dernier contexte reste [GRACE_MS] pour que le mini-lecteur
     * ne disparaisse pas d'un coup ; [dismissGrace] (la croix) le ferme tout de suite.
     */
    public val graceContext: StateFlow<ActiveAudioContext?> = mutableGrace.asStateFlow()

    init {
        engine.setConsumedLanguageProvider(::playedTrackLanguage)
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
        if (!start(current, PlaybackCommandOrigin.InApp)) return
        val queue = mutableSnapshot.value.queue.started(current, tail)
        mutableSnapshot.value = CoordinatorSnapshot(
            queue = queue,
            context = ActiveAudioContext(current, conversationName, conversationArtworkUrl, accentHex),
        )
        dismissGrace()
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
        if (snapshot.context == null) return
        if (!snapshot.queue.hasNext) {
            engine.stop()
            exhaust(snapshot.context)
            return
        }
        switchTo(snapshot.queue.advanced(), origin)
    }

    /** [QueueStepRule] : au-delà de trois secondes de lecture, « précédent » recommence le vocal ; sinon il recule. */
    public fun previous(origin: PlaybackCommandOrigin = PlaybackCommandOrigin.InApp) {
        val snapshot = mutableSnapshot.value
        when (QueueStepRule.previous(engine.state.value.currentTimeMs, snapshot.queue.hasPrevious)) {
            PreviousStep.Restart -> engine.seekToMs(0L)
            PreviousStep.Rewind -> switchTo(snapshot.queue.rewound(), origin)
        }
    }

    /**
     * #15969 — le vocal en cours [fromAttachmentId] a été accusé sous [toAttachmentId], servi depuis [servedUrl] : la file, le
     * contexte et le moteur prennent ce nom (la fin le marquera écouté sous l'id serveur) sans rien recharger. Une pièce que
     * le moteur ne tient pas, ou qui n'est pas la courante de la file, ne change rien.
     */
    public fun follow(fromAttachmentId: String, toAttachmentId: String, servedUrl: String, messageId: String? = null) {
        if (fromAttachmentId == toAttachmentId || servedUrl.isBlank()) return
        if (engine.state.value.attachmentId != fromAttachmentId) return
        val snapshot = mutableSnapshot.value
        val current = snapshot.queue.current?.takeIf { it.attachmentId == fromAttachmentId } ?: return
        engine.follow(fromAttachmentId, toAttachmentId, servedUrl, current.isProtected)
        val queue = snapshot.queue.followed(fromAttachmentId, toAttachmentId, servedUrl, messageId)
        mutableSnapshot.value = snapshot.copy(queue = queue, context = snapshot.context?.copy(audio = queue.current ?: current))
    }

    /**
     * Le drapeau d'une langue de piste a basculé : le vocal COURANT se recharge sur sa nouvelle variante ([variant], même
     * pièce) — sans quoi le texte changerait pendant que la voix resterait dans l'ancienne langue. Le moteur reprend la
     * position qu'il a gardée pour cette pièce, la file et le contexte prennent la variante. Une autre pièce, ou la même
     * piste, ne change rien ; une garde d'appel qui refuse laisse tout en l'état.
     */
    public fun switchVariant(variant: QueuedAudio) {
        val snapshot = mutableSnapshot.value
        val current = snapshot.queue.current?.takeIf { it.attachmentId == variant.attachmentId } ?: return
        if (current.fileUrl == variant.fileUrl) return
        if (!start(variant, PlaybackCommandOrigin.Automatic)) return
        mutableSnapshot.value = snapshot.copy(queue = snapshot.queue.withVariant(variant), context = snapshot.context?.copy(audio = variant))
    }

    /** L'onde de la bulle : se placer à [fraction] (0…1) du vocal en cours. */
    public fun seek(fraction: Double) = engine.seek(fraction)

    /** La barre de la carte système : se placer à [positionMs] dans le vocal en cours. */
    public fun seekToMs(positionMs: Long) = engine.seekToMs(positionMs)

    /** ±15 s de la carte système, depuis la position du moteur. */
    public fun skip(seconds: Double) = engine.skip(seconds)

    public fun cycleSpeed() = engine.setSpeed(CoordinatorSpeedCycle.next(engine.state.value.speed))

    public fun stop() {
        engine.stop()
        mutableSnapshot.value = CoordinatorSnapshot()
        dismissGrace()
    }

    /** La croix du mini-lecteur : le contexte de grâce disparaît immédiatement. */
    public fun dismissGrace() {
        graceJob?.cancel()
        graceJob = null
        mutableGrace.value = null
    }

    /** La grâce est posée AVANT de vider le contexte : un observateur des deux flux ne voit jamais « ni contexte ni grâce ». */
    private fun exhaust(last: ActiveAudioContext?) {
        graceJob?.cancel()
        graceJob = null
        if (last == null) {
            mutableGrace.value = null
            mutableSnapshot.value = CoordinatorSnapshot()
            return
        }
        mutableGrace.value = last
        mutableSnapshot.value = CoordinatorSnapshot()
        graceJob = scope.launch {
            delay(GRACE_MS)
            mutableGrace.value = null
        }
    }

    /**
     * Le message est supprimé (ou brûlé) : s'il est celui qui joue, la lecture se ferme — iOS `close()`, jamais un saut
     * au suivant, qui ferait parler un vocal que personne n'a choisi à l'instant où la conversation le retire. Sinon
     * ses vocaux quittent la file, et la lecture n'est pas touchée.
     */
    public fun onMessageDeleted(messageId: String) {
        val snapshot = mutableSnapshot.value
        if (snapshot.queue.current?.messageId == messageId) {
            stop()
            return
        }
        val cleaned = snapshot.queue.withoutMessage(messageId)
        if (cleaned != snapshot.queue) mutableSnapshot.value = snapshot.copy(queue = cleaned)
    }

    /** La conversation qui joue est supprimée, fermée ou obsolète : la lecture se ferme. Une autre n'y change rien. */
    public fun onConversationDeleted(conversationId: String) {
        if (mutableSnapshot.value.context?.audio?.conversationId == conversationId) stop()
    }

    /** Déconnexion : plus rien ne joue, plus rien ne reste. */
    override suspend fun clear() = withContext(dispatcher) { stop() }

    /**
     * La langue ENTENDUE du vocal que le moteur décharge, lue par lui au moment de clore l'écoute (fin, pause, changement de
     * piste) : celle de la piste servie, jamais une seconde descente du Prisme. Le moteur est partagé : un id qui n'est pas
     * celui de la file (aperçu, enregistreur) ne porte aucune langue — mieux vaut rien qu'en inventer une.
     */
    private fun playedTrackLanguage(): String? {
        val current = mutableSnapshot.value.queue.current ?: return null
        return current.trackLanguage?.takeIf { engine.state.value.attachmentId == current.attachmentId }
    }

    private fun switchTo(queue: AudioPlayQueue, origin: PlaybackCommandOrigin) {
        val target = queue.current ?: return stop()
        if (!start(target, origin)) return
        mutableSnapshot.value = mutableSnapshot.value.let { it.copy(queue = queue, context = it.context?.copy(audio = target)) }
    }

    /** Un vocal pas encore envoyé se joue depuis son fichier `file://` ; tout autre par le réseau et son cache. */
    private fun start(target: QueuedAudio, origin: PlaybackCommandOrigin): Boolean =
        if (LocalFileUrl.isLocal(target.fileUrl)) {
            engine.playLocal(target.attachmentId, target.fileUrl, origin)
        } else {
            engine.play(target.attachmentId, target.fileUrl, origin, target.isProtected)
        }

    private fun onFinished(event: AudioEngineEvent.Finished) {
        val snapshot = mutableSnapshot.value
        val finished = snapshot.queue.current?.takeIf { it.attachmentId == event.attachmentId } ?: return
        mutableFinished.tryEmit(AttachmentFinishedEvent(finished.attachmentId, finished.conversationId, event.completed))
        if (snapshot.queue.hasNext) {
            switchTo(snapshot.queue.advanced(), PlaybackCommandOrigin.Automatic)
            // Une garde d'appel qui refuse l'enchaînement laisse la file au vocal terminé : on la vide.
            if (mutableSnapshot.value.queue.current?.attachmentId == finished.attachmentId) exhaust(snapshot.context)
        } else {
            exhaust(snapshot.context)
        }
    }

    private companion object {
        const val GRACE_MS = 5_000L
    }
}
