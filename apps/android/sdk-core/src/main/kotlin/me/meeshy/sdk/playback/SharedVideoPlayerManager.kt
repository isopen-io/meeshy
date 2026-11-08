package me.meeshy.sdk.playback

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.playback.AudioTrackActivationLaw
import me.meeshy.sdk.model.playback.MediaSessionEvent
import me.meeshy.sdk.model.playback.MuteStretchEffect
import me.meeshy.sdk.model.playback.PlaybackLoopQueue
import me.meeshy.sdk.model.playback.PlaybackLoopTurn
import me.meeshy.sdk.model.playback.PlaybackProgressLaw
import me.meeshy.sdk.model.playback.VideoMountingLaw
import me.meeshy.sdk.model.playback.VideoMuteState
import me.meeshy.sdk.model.playback.VideoSurfaceRole

/**
 * **Le gestionnaire vidéo partagé** (iOS `SharedAVPlayerManager`) : UN lecteur vidéo vit à la fois.
 *
 * - démarrer une vidéo éteint l'audio et les autres lecteurs par le [PlaybackCoordinator] ;
 * - mute global ([VideoMuteState.isMuted]) conservé d'une vidéo à l'autre + intention de surface
 *   ([VideoMuteState.isForceMuted]) remise à zéro au changement de pièce ;
 * - une file de boucle tient un successeur du MÊME média derrière l'élément en cours ;
 * - l'observateur de fin de flux est UNIQUE : `complete = true` part une seule fois avant l'arrêt ou le tour ;
 * - un lecteur préparé n'est adopté que s'il lit le fichier local.
 *
 * Confiné au fil principal, comme le lecteur qu'il pilote. Aucun type Media3 n'est exposé.
 */
public class SharedVideoPlayerManager(
    private val portFactory: VideoPlayerPortFactory,
    private val coordinator: PlaybackCoordinator,
    private val scope: CoroutineScope,
    private val tickMs: Long = 250L,
    private val tickIntervalMs: () -> Long = { tickMs },
    private val onOutgoingPort: (VideoPlayerPort) -> Unit = { it.release() },
) : CoordinatedPlayer, VideoPlayerPort.Listener {

    private val _state = MutableStateFlow(VideoPlaybackState())
    public val state: StateFlow<VideoPlaybackState> = _state.asStateFlow()

    private val _events = MutableSharedFlow<VideoWatchEvent>(extraBufferCapacity = 16)

    /** Les fins de flux et les arrêts, pour le visionnage et le compteur de lectures. */
    public val events: SharedFlow<VideoWatchEvent> = _events.asSharedFlow()

    private var port: VideoPlayerPort? = null
    private var generation = 0
    private var queue = PlaybackLoopQueue()
    private var endedReported = false
    private var wantsPlayback = false
    private var ticker: Job? = null
    private val interruption = InterruptionResumeAdapter(
        isPlaying = { wantsPlayback },
        pause = { haltForPause() },
        resume = { play() },
    )

    override val kind: CoordinatedPlayerKind = CoordinatedPlayerKind.Video
    override val isPlayingAudibly: Boolean get() = _state.value.isPlaying && !_state.value.effectiveMuted
    override val respondsToSessionInterruptions: Boolean get() = true

    /** Le verdict de montage : cette surface peut-elle poser le lecteur pour ce média ? */
    public fun mayMountPlayer(role: VideoSurfaceRole, media: String): Boolean = VideoMountingLaw.mayMountPlayer(
        role = role,
        surfaceMedia = media,
        activeMedia = _state.value.activeMedia,
        isPipActive = _state.value.isPipActive,
    )

    // region Mute

    public var isMuted: Boolean
        get() = _state.value.mute.isMuted
        set(value) = setMute(_state.value.mute.copy(isMuted = value))

    public var isForceMuted: Boolean
        get() = _state.value.mute.isForceMuted
        set(value) = setMute(_state.value.mute.copy(isForceMuted = value))

    /** Le bouton haut-parleur du fil : une demande explicite de son rallume aussi la préférence globale. */
    public fun setSurfaceSound(soundOn: Boolean) {
        setMute(_state.value.mute.withSurfaceSound(soundOn))
    }

    private fun setMute(next: VideoMuteState) {
        val previous = _state.value.mute
        if (next == previous) return
        _state.update { it.copy(mute = next) }
        port?.let { applyOutput(it, playerIsMuted = previous.effectiveMuted, wantsMuted = next.effectiveMuted) }
        when (next.stretchEffect(previous)) {
            MuteStretchEffect.CLOSE_STRETCH -> reportWatch(complete = false)
            MuteStretchEffect.REOPEN_STRETCH, MuteStretchEffect.NONE -> Unit
        }
    }

    // endregion

    // region Chargement

    /**
     * Charge [media] ; sans effet pour le média déjà actif. Le lecteur [prepared] n'est adopté que
     * s'il lit le fichier local (ou qu'aucun fichier n'existe) : préparé sur le flux alors que le fichier
     * est là, il se jette.
     */
    public fun load(media: VideoMedia, prepared: PreparedVideo? = null) {
        if (media.url.isEmpty() || media.url == _state.value.activeMedia) return
        val outgoing = port
        cleanup(unloadPort = false)
        generation += 1
        val gen = generation
        val localOnDisk = media.localFileUri != null
        val adopted = prepared?.takeIf {
            VideoMountingLaw.mayAdoptPreparedPlayer(playsLocalFile = it.port.playsLocalFile, localFileOnDisk = localOnDisk)
        }
        val next = adopted?.port ?: outgoing ?: portFactory.create()
        if (outgoing != null && outgoing !== next) recycleOrRelease(outgoing)
        if (prepared != null && adopted == null) prepared.port.release()
        port = next
        next.setListener(this)
        val wantsMuted = _state.value.effectiveMuted
        applyOutput(next, playerIsMuted = !wantsMuted, wantsMuted = wantsMuted)
        next.setLooping(_state.value.isLooping)
        val source = media.localFileUri?.let { VideoSource(it, isLocalFile = true) } ?: VideoSource(media.url, isLocalFile = false)
        if (adopted != null) {
            next.setSpeed(_state.value.speed)
            _state.update {
                it.copy(
                    activeMedia = media.identity,
                    attachmentId = media.attachmentId,
                    durationMs = adopted.durationMs,
                )
            }
        } else {
            _state.update { it.copy(activeMedia = media.identity, attachmentId = media.attachmentId) }
            next.load(source, gen, _state.value.speed)
        }
        queue = PlaybackLoopQueue.withCurrentItem()
        refreshLoopSuccessor()
    }

    /** La loi d'activation : sortie coupée AVANT la piste, piste rallumée sous la sortie encore muette. */
    private fun applyOutput(target: VideoPlayerPort, playerIsMuted: Boolean, wantsMuted: Boolean) {
        AudioTrackActivationLaw.steps(playerIsMuted, wantsMuted).forEach { step ->
            when (step) {
                AudioTrackActivationLaw.Step.SILENCE_PLAYER -> target.setMuted(true)
                AudioTrackActivationLaw.Step.DISABLE_AUDIO_TRACKS -> target.setAudioTracksEnabled(false)
                AudioTrackActivationLaw.Step.ENABLE_AUDIO_TRACKS -> target.setAudioTracksEnabled(true)
                AudioTrackActivationLaw.Step.SOUND_PLAYER -> target.setMuted(false)
            }
        }
    }

    /** Les pistes d'un élément n'existent qu'une fois prêt : l'état voulu se réconcilie alors (boucle comprise). */
    private fun reconcileAudioTracks() {
        val wantsMuted = _state.value.effectiveMuted
        port?.setAudioTracksEnabled(!AudioTrackActivationLaw.audioTracksDisabled(wantsMuted))
    }

    private fun recycleOrRelease(outgoing: VideoPlayerPort) {
        if (VideoMountingLaw.mayRecycleOutgoingPlayer(outgoing.isReady, outgoing.playsLocalFile)) {
            outgoing.dropLoopSuccessors()
            outgoing.setListener(null)
            onOutgoingPort(outgoing)
        } else {
            outgoing.setListener(null)
            outgoing.release()
        }
    }

    // endregion

    // region Commandes

    public fun play() {
        val current = port ?: return
        if (_state.value.activeMedia.isEmpty()) return
        coordinator.willStartPlaying(this)
        wantsPlayback = true
        interruption.onUserStarted()
        endedReported = false
        current.play()
        startTicker()
    }

    public fun pause() {
        if (port == null) return
        interruption.onUserPaused()
        haltForPause()
    }

    private fun haltForPause() {
        wantsPlayback = false
        reportWatch(complete = false)
        port?.pause()
        publishPosition()
        stopTicker()
    }

    public fun togglePlayPause() {
        if (_state.value.isPlaying || wantsPlayback) pause() else play()
    }

    public fun seek(positionMs: Long) {
        val current = port ?: return
        val head = PlaybackProgressLaw.headAfterSeek(positionMs / 1000.0, _state.value.durationMs / 1000.0)
        val headMs = (head * 1000).toLong()
        current.seekTo(headMs)
        _state.update { it.copy(positionMs = headMs) }
    }

    public fun setSpeed(speed: Float) {
        _state.update { it.copy(speed = speed) }
        port?.setSpeed(speed)
    }

    public fun setLooping(looping: Boolean) {
        _state.update { it.copy(isLooping = looping) }
        port?.setLooping(looping)
        refreshLoopSuccessor()
    }

    public fun setPictureInPictureActive(active: Boolean) {
        _state.update { it.copy(isPipActive = active) }
    }

    /** La tête réelle, interrogée par la barre au moment de dessiner (jamais abonnée). */
    public fun liveProgress(): Double {
        val duration = _state.value.durationMs / 1000.0
        val position = port?.positionMs()?.div(1000.0) ?: 0.0
        return PlaybackProgressLaw.fraction(position, duration)
    }

    /** Arrête et décharge : le coordinateur éteint aussi par ce chemin. */
    override fun stop() {
        if (_state.value.activeMedia.isEmpty() && port == null) return
        interruption.onContentReleased()
        cleanup()
    }

    /** Libère le lecteur (mémoire basse, retrait) ; le mute global reste. */
    public fun release() {
        cleanup()
        port?.let { it.setListener(null); it.release() }
        port = null
    }

    override fun handleSessionEvent(event: MediaSessionEvent) {
        interruption.onSessionEvent(event)
    }

    private fun cleanup(unloadPort: Boolean = true) {
        stopTicker()
        reportWatch(complete = false)
        wantsPlayback = false
        endedReported = false
        generation += 1
        port?.let { if (unloadPort) it.stop() else it.pause() }
        queue = PlaybackLoopQueue()
        val mute = _state.value.mute.onMediaChanged()
        _state.update {
            VideoPlaybackState(
                speed = it.speed,
                isLooping = it.isLooping,
                isPipActive = it.isPipActive,
                mute = mute,
            )
        }
    }

    // endregion

    // region Retours du lecteur

    override fun onPrepared(generation: Int, durationMs: Long) {
        if (generation != this.generation) return
        reconcileAudioTracks()
        val held = (PlaybackProgressLaw.heldDuration(durationMs / 1000.0, _state.value.durationMs / 1000.0, _state.value.isLooping) * 1000).toLong()
        _state.update { it.copy(durationMs = held) }
    }

    override fun onFirstFrame(generation: Int) {
        if (generation != this.generation) return
        _state.update { it.copy(hasRenderedFirstFrame = true) }
    }

    override fun onIsPlayingChanged(generation: Int, isPlaying: Boolean) {
        if (generation != this.generation) return
        _state.update { it.copy(isPlaying = isPlaying) }
    }

    override fun onLoopTurn(generation: Int) {
        if (generation != this.generation) return
        emitComplete()
        reconcileAudioTracks()
        queue = queue.advanced()
        endedReported = false
        _state.update { it.copy(positionMs = 0L) }
        refreshLoopSuccessor()
    }

    override fun onEnded(generation: Int) {
        if (generation != this.generation) return
        emitComplete()
        if (_state.value.isLooping) {
            val action = PlaybackLoopTurn.action(finishedIsCurrent = true, successorQueued = queue.hasSuccessor)
            if (action == PlaybackLoopTurn.Action.REWIND_CURRENT_ITEM) {
                endedReported = false
                port?.seekTo(0L)
                port?.play()
                _state.update { it.copy(positionMs = 0L) }
                refreshLoopSuccessor()
            }
            return
        }
        wantsPlayback = false
        stopTicker()
        cleanup()
    }

    override fun onError(generation: Int, cause: Throwable) {
        if (generation != this.generation) return
        wantsPlayback = false
        stopTicker()
        _state.update { it.copy(isPlaying = false) }
    }

    /** L'observateur de fin de flux UNIQUE : `complete = true` ne part qu'une fois par fin. */
    private fun emitComplete() {
        if (endedReported) return
        endedReported = true
        reportWatch(complete = true)
    }

    private fun reportWatch(complete: Boolean) {
        val s = _state.value
        if (s.activeMedia.isEmpty()) return
        val position = if (complete) s.durationMs else (port?.positionMs() ?: s.positionMs)
        _events.tryEmit(VideoWatchEvent(s.activeMedia, s.attachmentId, position, s.durationMs, complete))
    }

    private fun refreshLoopSuccessor() {
        if (!_state.value.isLooping || _state.value.activeMedia.isEmpty()) {
            port?.dropLoopSuccessors()
            queue = queue.dropSuccessors()
            return
        }
        val current = port ?: return
        val result = queue.queueSuccessor()
        if (result.inserted) {
            if (current.queueLoopSuccessor()) queue = result.queue
        }
    }

    // endregion

    // region Horloge à faible fréquence

    private fun startTicker() {
        if (ticker?.isActive == true) return
        ticker = scope.launch {
            while (isActive) {
                delay(tickIntervalMs())
                publishPosition()
            }
        }
    }

    private fun stopTicker() {
        ticker?.cancel()
        ticker = null
    }

    private fun publishPosition() {
        val head = port?.positionMs() ?: return
        if (head != _state.value.positionMs) _state.update { it.copy(positionMs = head) }
    }

    // endregion
}
