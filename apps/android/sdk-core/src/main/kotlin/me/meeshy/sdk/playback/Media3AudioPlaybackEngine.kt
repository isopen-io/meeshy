package me.meeshy.sdk.playback

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.media.PlaybackReportSink
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackAction
import me.meeshy.sdk.model.playback.AudioPlaybackReducer
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.ListenSegmentTracker
import me.meeshy.sdk.model.playback.MediaSessionEvent
import me.meeshy.sdk.model.playback.MediaResumeMerge
import me.meeshy.sdk.model.playback.PlaybackCommand
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.model.playback.PlaybackPermissionGuard
import me.meeshy.sdk.model.playback.PlaybackResumeDeadZone
import timber.log.Timber
import kotlin.math.abs

/**
 * Le moteur de lecture audio singleton (iOS `AudioPlaybackManager`), au-dessus d'un [AudioPlayerPort]
 * — Media3 ExoPlayer en production ([ExoAudioPlayerPort]), un faux en test.
 *
 * Invariants :
 * - UN vocal chargé : en choisir un autre arrête l'ancien, sauve sa position, clôt son écoute et
 *   bascule `attachmentId` dans la même transition d'état ([AudioPlaybackReducer]) ;
 * - tout rappel du lecteur porte une génération, un chargement remplacé est ignoré ;
 * - la garde d'appel ([callActive]) bloque démarrage et reprise, jamais pause ni arrêt ;
 * - l'état est écrit AVANT d'ordonner le lecteur : les échos du lecteur retombent sur un état déjà vrai ;
 * - la progression n'est échantillonnée que pendant la lecture.
 */
internal class Media3AudioPlaybackEngine(
    private val portFactory: AudioPlayerPortFactory,
    private val positions: PlaybackPositionStore,
    private val reportSink: PlaybackReportSink,
    private val callActive: () -> Boolean,
    dispatcher: CoroutineDispatcher,
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
    private val coordinator: PlaybackCoordinator? = null,
) : AudioPlaybackEngine, AudioPlayerPort.Listener, CoordinatedPlayer {

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val mutableState = MutableStateFlow(AudioPlaybackState())
    private val mutableEvents = MutableSharedFlow<AudioEngineEvent>(extraBufferCapacity = 16)

    override val state: StateFlow<AudioPlaybackState> = mutableState.asStateFlow()
    override val events: SharedFlow<AudioEngineEvent> = mutableEvents.asSharedFlow()

    private var port: AudioPlayerPort? = null
    private var generation = 0
    private var loaded = false
    private var tracker = ListenSegmentTracker()
    private var ticker: Job? = null
    private var held: Pair<String, MeeshyMediaConsumption?>? = null
    private var languageProvider: (() -> String?)? = null
    private var source: AudioSource? = null
    private var servedFallback: AudioSource? = null
    private var retarget: Retarget? = null

    private val interruptions = InterruptionResumeAdapter(
        isPlaying = { mutableState.value.isPlaying },
        pause = ::pauseNow,
        resume = ::resumeFromInterruption,
    )

    override val kind: CoordinatedPlayerKind = CoordinatedPlayerKind.Audio
    override val isPlayingAudibly: Boolean get() = mutableState.value.isPlaying
    override val respondsToSessionInterruptions: Boolean = true

    override fun handleSessionEvent(event: MediaSessionEvent) = interruptions.onSessionEvent(event)

    private fun player(): AudioPlayerPort =
        port ?: portFactory.create().also { it.setListener(this); port = it }

    private fun dispatch(action: AudioPlaybackAction) {
        mutableState.value = AudioPlaybackReducer.reduce(mutableState.value, action)
    }

    private fun positionNow(): Long = retarget?.positionMs ?: if (loaded) player().positionMs() else mutableState.value.currentTimeMs

    // ── Chargement ───────────────────────────────────────────────────────────────────────────────

    override fun play(attachmentId: String, url: String, origin: PlaybackCommandOrigin, isProtected: Boolean): Boolean =
        start(attachmentId, url.takeIf { it.isNotBlank() }?.let { AudioSource.Remote(it, isProtected) }, origin)

    override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin): Boolean =
        start(attachmentId, fileUri.takeIf { it.isNotBlank() }?.let(AudioSource::Local), origin)

    private fun start(attachmentId: String, source: AudioSource?, origin: PlaybackCommandOrigin): Boolean {
        if (!PlaybackPermissionGuard.allows(PlaybackCommand.Start, origin, callActive())) return false
        coordinator?.willStartPlaying(this)
        releaseCurrent(StopReason.Superseded)
        if (source == null) {
            dispatch(AudioPlaybackAction.Stopped)
            return false
        }
        generation += 1
        dispatch(AudioPlaybackAction.LoadRequested(attachmentId))
        tracker = ListenSegmentTracker()
        this.source = source
        try {
            player().load(source, generation, mutableState.value.speed.rate)
        } catch (failure: Exception) {
            Timber.e(failure, "Lecture audio : chargement refusé")
            failLoad()
        }
        return true
    }

    override fun onPrepared(generation: Int, durationMs: Long) {
        if (generation != this.generation) return
        retarget?.let { return onRetargeted(it) }
        if (!mutableState.value.isLoading) return
        val id = mutableState.value.attachmentId ?: return
        loaded = true
        val saved = positions.position(id)?.positionMs
        val resume = MediaResumeMerge.resumePositionMs(
            localMs = saved,
            served = MediaResumeMerge.heldConsumption(held?.first, held?.second, matching = id),
            medium = MediaResumeMerge.Medium.Audio,
            totalMs = durationMs,
        )
        val startMs = when (val action = PlaybackResumeDeadZone.action(resume, currentMs = 0L)) {
            PlaybackResumeDeadZone.Action.None -> 0L
            is PlaybackResumeDeadZone.Action.SeekTo -> action.positionMs
        }
        dispatch(AudioPlaybackAction.Prepared(durationMs, startMs))
        val player = player()
        if (startMs > 0L) player.seekTo(startMs)
        player.setSpeed(mutableState.value.speed.rate)
        player.play()
        tracker = tracker.begin(startMs)
        startTicker()
    }

    // ── Commandes ────────────────────────────────────────────────────────────────────────────────

    override fun togglePlayPause(origin: PlaybackCommandOrigin) {
        val current = mutableState.value
        if (!loaded || !current.hasTrack) return
        if (current.isPlaying) pause() else resume(PlaybackCommand.Resume, origin)
    }

    override fun pause() {
        interruptions.onUserPaused()
        pauseNow()
    }

    private fun pauseNow() {
        val current = mutableState.value
        if (!loaded || !current.isPlaying) return
        val position = positionNow()
        dispatch(AudioPlaybackAction.Paused)
        stopTicker()
        tracker = tracker.pause(position)
        player().pause()
        flushReport(complete = false)
        persistPosition()
    }

    override fun resumeFromInterruption() {
        if (loaded && !mutableState.value.isPlaying) resume(PlaybackCommand.Resume, PlaybackCommandOrigin.Automatic)
    }

    private fun resume(command: PlaybackCommand, origin: PlaybackCommandOrigin) {
        if (!PlaybackPermissionGuard.allows(command, origin, callActive())) return
        if (origin != PlaybackCommandOrigin.Automatic) interruptions.onUserStarted()
        dispatch(AudioPlaybackAction.Resumed)
        val player = player()
        player.setSpeed(mutableState.value.speed.rate)
        player.play()
        tracker = tracker.begin(positionNow())
        startTicker()
    }

    override fun stop() {
        releaseCurrent(StopReason.Stopped)
        dispatch(AudioPlaybackAction.Stopped)
    }

    override fun seek(fraction: Double) {
        val duration = mutableState.value.durationMs
        if (!loaded || duration <= 0L) return
        seekToMs((fraction.coerceIn(0.0, 1.0) * duration).toLong())
    }

    override fun seekToMs(positionMs: Long) {
        if (!loaded) return
        val from = positionNow()
        dispatch(AudioPlaybackAction.SeekToMs(positionMs))
        val target = mutableState.value.currentTimeMs
        tracker = tracker.seek(from, target)
        if (retarget != null) retarget = Retarget(target)
        player().seekTo(target)
    }

    override fun skip(seconds: Double) {
        if (!loaded) return
        seekToMs(positionNow() + (seconds * 1_000).toLong())
    }

    override fun setSpeed(speed: PlaybackSpeed) {
        dispatch(AudioPlaybackAction.SpeedSet(speed))
        if (loaded) player().setSpeed(speed.rate)
    }

    override fun cycleSpeed() = setSpeed(mutableState.value.speed.next())

    override fun setLoop(loop: Boolean) = dispatch(AudioPlaybackAction.LoopSet(loop))

    override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) {
        held = attachmentId to consumption
    }

    override fun setConsumedLanguageProvider(provider: (() -> String?)?) {
        languageProvider = provider
    }

    override fun follow(fromAttachmentId: String, toAttachmentId: String, servedUrl: String, isProtected: Boolean) {
        if (fromAttachmentId == toAttachmentId || servedUrl.isBlank()) return
        if (mutableState.value.attachmentId != fromAttachmentId) return
        dispatch(AudioPlaybackAction.Relabeled(toAttachmentId))
        val served = AudioSource.Remote(servedUrl, isProtected)
        servedFallback = served.takeIf { it != source && retarget == null }
    }

    /** Libère le lecteur et le fil du moteur (fin du process ou déconnexion définitive). */
    fun release() {
        stop()
        port?.release()
        port = null
        scope.cancel()
    }

    // ── Rappels du lecteur ───────────────────────────────────────────────────────────────────────

    override fun onEnded(generation: Int) {
        if (generation != this.generation || !loaded) return
        val current = mutableState.value
        val id = current.attachmentId ?: return
        stopTicker()
        tracker = tracker.completed(current.durationMs)
        flushReport(complete = true)
        positions.clear(id)
        if (current.shouldLoop) {
            dispatch(AudioPlaybackAction.Ended)
            val player = player()
            player.seekTo(0L)
            player.play()
            tracker = tracker.begin(0L)
            startTicker()
            return
        }
        dispatch(AudioPlaybackAction.Ended)
        loaded = false
        player().stop()
        mutableEvents.tryEmit(AudioEngineEvent.Finished(id, completed = true))
    }

    override fun onError(generation: Int, cause: Throwable) {
        if (generation != this.generation) return
        if (retargetOntoServedAddress()) return
        Timber.e(cause, "Lecture audio : source illisible")
        failLoad()
    }

    override fun onPlayWhenReadyChanged(generation: Int, playWhenReady: Boolean) {
        if (generation != this.generation || !loaded || retarget != null) return
        val current = mutableState.value
        if (!playWhenReady && current.isPlaying) {
            // Le lecteur s'est arrêté seul (focus perdu, casque débranché) : l'écoute est coupée net.
            val position = positionNow()
            dispatch(AudioPlaybackAction.Paused)
            stopTicker()
            tracker = tracker.pause(position)
            flushReport(complete = false)
            persistPosition()
        } else if (playWhenReady && !current.isPlaying) {
            // Il redémarre seul (focus rendu après une interruption) : pas pendant un appel.
            if (!PlaybackPermissionGuard.allows(PlaybackCommand.Resume, PlaybackCommandOrigin.Automatic, callActive())) {
                player().pause()
                return
            }
            dispatch(AudioPlaybackAction.Resumed)
            tracker = tracker.begin(positionNow())
            startTicker()
        }
    }

    // ── Interne ──────────────────────────────────────────────────────────────────────────────────

    private enum class StopReason { Superseded, Stopped }

    /** Le reciblage en vol : la position où reprendre ; jouer ou non se lit dans l'état, qu'un geste a pu changer entre-temps. */
    private class Retarget(val positionMs: Long)

    /**
     * #15969 — la source lue a disparu, mais le vocal a été accusé : il reprend UNE fois, au même point, sur son adresse
     * servie (que le cache AUDIO tient déjà). `false` quand il n'y a rien à recibler : c'est un vrai échec.
     */
    private fun retargetOntoServedAddress(): Boolean {
        val served = servedFallback ?: return false
        if (!loaded || retarget != null) return false
        servedFallback = null
        val resume = Retarget(positionMs = runCatching { player().positionMs() }.getOrDefault(mutableState.value.currentTimeMs))
        stopTicker()
        generation += 1
        source = served
        retarget = resume
        return try {
            player().load(served, generation, mutableState.value.speed.rate)
            true
        } catch (failure: Exception) {
            Timber.e(failure, "Lecture audio : reciblage sur l'adresse servie refusé")
            retarget = null
            false
        }
    }

    private fun onRetargeted(resume: Retarget) {
        retarget = null
        val player = player()
        player.seekTo(resume.positionMs)
        player.setSpeed(mutableState.value.speed.rate)
        if (!mutableState.value.isPlaying) return
        player.play()
        startTicker()
    }

    private fun failLoad() {
        val id = mutableState.value.attachmentId
        stopTicker()
        if (loaded) {
            tracker = tracker.dismissed(positionNow())
            flushReport(complete = false)
        }
        loaded = false
        retarget = null
        servedFallback = null
        dispatch(AudioPlaybackAction.Failed)
        runCatching { player().stop() }
        if (id != null) mutableEvents.tryEmit(AudioEngineEvent.Finished(id, completed = false))
    }

    /** Sauve la position, clôt l'écoute en cours et décharge le lecteur. */
    private fun releaseCurrent(@Suppress("UNUSED_PARAMETER") reason: StopReason) {
        interruptions.onContentReleased()
        stopTicker()
        if (loaded) {
            val position = positionNow()
            persistPosition(position)
            if (tracker.hasOpenSegment) tracker = tracker.dismissed(position)
            flushReport(complete = false, positionMs = position)
        }
        loaded = false
        retarget = null
        servedFallback = null
        source = null
        generation += 1
        port?.let { runCatching { it.stop() } }
    }

    private fun flushReport(complete: Boolean, positionMs: Long = positionNowOrState()) {
        val id = mutableState.value.attachmentId ?: return
        val (body, drained) = tracker.drainReport(positionMs, mutableState.value.durationMs, languageProvider?.invoke())
        tracker = drained
        if (body == null) return
        runCatching { reportSink.report(id, body) }
            .onFailure { Timber.w(it, "Rapport d'écoute perdu (complete=%s)", complete) }
    }

    private fun positionNowOrState(): Long = if (loaded) positionNow() else mutableState.value.currentTimeMs

    private fun persistPosition(positionMs: Long = positionNowOrState()) {
        val current = mutableState.value
        val id = current.attachmentId ?: return
        if (current.durationMs < PlaybackResumeDeadZone.MIN_RESUMABLE_DURATION_MS) return
        if (PlaybackResumeDeadZone.isResumable(positionMs, current.durationMs)) {
            positions.save(id, positionMs, nowEpochMs())
        } else {
            positions.clear(id)
        }
    }

    private fun startTicker() {
        ticker?.cancel()
        ticker = scope.launch {
            while (isActive) {
                delay(TICK_INTERVAL_MS)
                publishTick()
            }
        }
    }

    private fun stopTicker() {
        ticker?.cancel()
        ticker = null
    }

    private fun publishTick() {
        val current = mutableState.value
        if (!loaded || !current.isPlaying) return
        val position = player().positionMs()
        tracker = tracker.observe(position)
        if (abs(position - current.currentTimeMs) >= TICK_WRITE_THRESHOLD_MS) {
            dispatch(AudioPlaybackAction.Tick(position))
        }
    }

    private companion object {
        const val TICK_INTERVAL_MS = 100L
        const val TICK_WRITE_THRESHOLD_MS = 50L
    }
}
