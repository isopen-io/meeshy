package me.meeshy.sdk.playback

import me.meeshy.sdk.model.playback.InterruptionResumeLedger
import me.meeshy.sdk.model.playback.MediaSessionEvent

public enum class CoordinatedPlayerKind {
    /** Un lecteur de vocaux ou de pistes audio. */
    Audio,

    /** Le lecteur vidéo (réel, vidéo de conversation). */
    Video,

    /** Tout autre son de Meeshy (aperçu, musique de story). */
    External,
}

/** Le volume propre d'un lecteur (jamais celui du système) : ce que l'enregistrement baisse puis rend. */
public interface PlaybackVolumeTarget {
    public var volume: Float
}

/**
 * Un lecteur que le [PlaybackCoordinator] sait éteindre — iOS `StoppablePlayer` /
 * `AudiblyPlayingPlayer` / `InterruptiblePlayer` / `FadingStoppablePlayer` en un seul contrat.
 * Les écrans ne dépendent jamais de Media3 : ils parlent à ce contrat.
 */
public interface CoordinatedPlayer {
    public val kind: CoordinatedPlayerKind

    /** `true` tant que le lecteur produit un son audible. */
    public val isPlayingAudibly: Boolean

    /**
     * `true` : le lecteur traduit lui-même les événements de session (pause puis reprise).
     * `false` : un appel l'arrête, tout simplement.
     */
    public val respondsToSessionInterruptions: Boolean get() = false

    public val volumeTarget: PlaybackVolumeTarget? get() = null

    public fun stop()

    public fun handleSessionEvent(event: MediaSessionEvent) {}

    /** Extinction en fondu ; par défaut un arrêt net. */
    public suspend fun fadeOutAndStop(durationMs: Long) {
        stop()
    }
}

/**
 * La colle d'un lecteur à la loi [InterruptionResumeLedger] : il lui donne ses événements de session et
 * ses gestes d'utilisateur, et applique la décision rendue — rien d'autre.
 */
public class InterruptionResumeAdapter(
    private val isPlaying: () -> Boolean,
    private val pause: () -> Unit,
    private val resume: () -> Unit,
) {
    private val ledger = InterruptionResumeLedger()

    public val holdsInterruptedPlayback: Boolean get() = ledger.holdsInterruptedPlayback

    public fun onSessionEvent(event: MediaSessionEvent) {
        val signal = InterruptionResumeLedger.signalFor(event, isPlaying()) ?: return
        apply(signal)
    }

    public fun onUserPaused(): Unit = apply(InterruptionResumeLedger.Signal.UserPaused)

    public fun onUserStarted(): Unit = apply(InterruptionResumeLedger.Signal.UserStartedPlayback)

    public fun onContentReleased(): Unit = apply(InterruptionResumeLedger.Signal.ContentReleased)

    private fun apply(signal: InterruptionResumeLedger.Signal) {
        when (ledger.handle(signal)) {
            InterruptionResumeLedger.Action.Pause -> pause()
            InterruptionResumeLedger.Action.Resume -> resume()
            InterruptionResumeLedger.Action.None -> Unit
        }
    }
}
