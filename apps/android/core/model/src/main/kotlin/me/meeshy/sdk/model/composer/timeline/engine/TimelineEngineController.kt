package me.meeshy.sdk.model.composer.timeline.engine

import me.meeshy.sdk.model.timeline.TimelineProject

/** La vidéo de l'aperçu, derrière une couture : le lecteur matériel n'est jamais vu du moteur. */
interface TimelineVideoPort {
    /** `false` : composition vide (slide sans vidéo de premier plan), l'horloge interne pilote le temps. */
    val hasVideo: Boolean
    val status: VideoItemStatus?
    fun positionSeconds(): Double

    /** Démarre la lecture ; [anchorNanos] = `null` : sans ancre (item en échec). */
    fun start(anchorNanos: Long?)
    fun pause()

    /** Seek asynchrone ; [onDone] reçoit `true` si le seek a abouti. */
    fun seekTo(seconds: Double, toleranceMs: Long, onDone: (Boolean) -> Unit)
}

/** L'audio de l'aperçu, derrière une couture. */
interface TimelineAudioPort {
    /** Joue depuis [timelineSeconds], position atteinte À [anchorNanos]. Peut lever. */
    fun play(timelineSeconds: Double, anchorNanos: Long)
    fun pause()
    fun seek(timelineSeconds: Double)
}

/**
 * Le moteur d'aperçu du montage (miroir de `StoryTimelineEngine`) : UNE ancre en temps hôte partagée par la vidéo, l'audio
 * et l'horloge interne ; un seek précis au relâché, tolérant pendant le geste ; les fins de seek invalidées par un geste
 * postérieur sont ignorées. Le fil appelant est le fil principal ; [nowNanos] est l'horloge monotone.
 */
class TimelineEngineController(
    private val video: TimelineVideoPort,
    private val audio: TimelineAudioPort,
    private val nowNanos: () -> Long,
) {
    var currentTime: Float = 0f
        private set
    var isPlaying: Boolean = false
        private set

    var onTimeUpdate: (Float) -> Unit = {}
    var onPlaybackEnd: () -> Unit = {}
    var onElementBecameActive: (String) -> Unit = {}
    var onError: (TimelineEngineError) -> Unit = {}

    private var project: TimelineProject? = null
    private var lastActiveClipId: String? = null
    private val generation = SeekGeneration()
    private var driveOrigin: Pair<Float, Double>? = null
    private var awaitingReadiness: Long? = null

    private val usesInternalClock: Boolean get() = !video.hasVideo

    fun configure(project: TimelineProject) {
        stopDrive()
        generation.advance()
        awaitingReadiness = null
        this.project = project
        lastActiveClipId = null
    }

    fun play() {
        val project = project ?: return
        if (usesInternalClock && currentTime >= project.slideDuration) currentTime = 0f
        startSynchronized()
        isPlaying = true
    }

    fun pause() {
        generation.advance()
        awaitingReadiness = null
        stopDrive()
        video.pause()
        audio.pause()
        isPlaying = false
    }

    fun toggle() = if (isPlaying) pause() else play()

    fun stop() {
        pause()
        seek(0f)
    }

    /** [precise] à `true` au relâché (à l'image) ; `false` pendant le geste (~50 ms). */
    fun seek(time: Float, precise: Boolean = true) {
        val project = project ?: return
        val clamped = time.coerceIn(0f, project.slideDuration)
        currentTime = clamped
        val ticket = generation.advance()
        if (isPlaying) audio.pause()
        audio.seek(clamped.toDouble())
        if (!usesInternalClock) {
            video.seekTo(clamped.toDouble(), TimelineSeek.toleranceMs(precise)) { finished ->
                if (finished) seekDidComplete(ticket)
            }
        } else if (isPlaying) {
            startSynchronized()
        }
        publish(clamped)
    }

    /** L'item vidéo a changé de statut : si le départ l'attendait, vidéo et son repartent ensemble. */
    fun onVideoStatusChanged() {
        val waiting = awaitingReadiness ?: return
        if (video.status == null || video.status == VideoItemStatus.UNKNOWN) return
        if (!generation.isCurrent(waiting)) return
        awaitingReadiness = null
        if (isPlaying) startSynchronized()
    }

    /** Le temps vidéo observé (équivalent de l'observateur périodique). */
    fun onVideoTime(seconds: Double) {
        if (usesInternalClock) return
        val time = seconds.toFloat()
        currentTime = time
        publish(time)
    }

    fun onVideoEnded() {
        audio.pause()
        isPlaying = false
        onPlaybackEnd()
    }

    /** Un tick de l'horloge interne (une image d'affichage) ; ignoré hors lecture sans vidéo. */
    fun tick(nowSeconds: Double) {
        val project = project
        val origin = driveOrigin
        if (project == null || origin == null) return stopDrive()
        val next = TimelinePlaybackSync.internalClockPlayhead(origin.first, origin.second, nowSeconds, project.slideDuration)
        currentTime = next
        publish(next)
        if (next >= project.slideDuration) {
            stopDrive()
            audio.pause()
            isPlaying = false
            onPlaybackEnd()
        }
    }

    private fun seekDidComplete(ticket: Long) {
        if (!generation.isCurrent(ticket) || !isPlaying) return
        startSynchronized()
    }

    private fun startSynchronized() {
        val ticket = generation.advance()
        val anchor = TimelinePlaybackSync.anchorNanos(nowNanos())
        val playhead: Float
        if (usesInternalClock) {
            playhead = currentTime
            driveOrigin = playhead to anchor / NANOS_PER_SECOND
        } else {
            if (TimelinePlaybackSync.videoStart(video.status) == VideoStart.AWAITING_READINESS) {
                awaitingReadiness = ticket
                return
            }
            val item = video.positionSeconds()
            playhead = if (item.isFinite()) item.toFloat() else currentTime
            val anchored = TimelinePlaybackSync.videoStart(video.status) == VideoStart.ANCHORED
            video.start(if (anchored) anchor else null)
        }
        try {
            audio.play(playhead.toDouble(), anchor)
        } catch (failure: Exception) {
            onError(TimelineEngineError.AudioEngineUnavailable(failure.message.orEmpty()))
        }
    }

    private fun stopDrive() {
        driveOrigin = null
    }

    private fun publish(seconds: Float) {
        onTimeUpdate(seconds)
        val project = project ?: return
        val active = TimelineActiveClip.activeClipId(seconds, project)
        if (active == lastActiveClipId) return
        lastActiveClipId = active
        active?.let(onElementBecameActive)
    }

    private companion object {
        const val NANOS_PER_SECOND = 1_000_000_000.0
    }
}
