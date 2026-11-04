package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.media.PlaybackSpeed

/**
 * L'état publié par le moteur de lecture audio — port des sept `@Published` d'iOS
 * `AudioPlaybackManager` (`isPlaying`, `progress`, `currentTime`, `duration`, `speed`,
 * `isLoading`, `attachmentId`).
 *
 * Les durées voyagent en millisecondes entières : le moteur Android les lit ainsi, et la barre ne
 * dessine pas plus fin que 100 ms.
 */
public data class AudioPlaybackState(
    /** Le vocal CHARGÉ (un seul à la fois). Posé avec le chargement, jamais après coup. */
    val attachmentId: String? = null,
    val isPlaying: Boolean = false,
    val isLoading: Boolean = false,
    val currentTimeMs: Long = 0L,
    val durationMs: Long = 0L,
    val speed: PlaybackSpeed = PlaybackSpeed.DEFAULT,
    /** Boucle (réels audio) : ne traverse JAMAIS une piste, l'appelant la redemande à chaque vocal. */
    val shouldLoop: Boolean = false,
) {
    /** 0..1, dérivé : jamais une seconde source de vérité à côté du temps. */
    val progress: Double
        get() = if (durationMs > 0L) (currentTimeMs.toDouble() / durationMs).coerceIn(0.0, 1.0) else 0.0

    /** Un vocal est chargé (en lecture, en pause ou en cours de chargement). */
    val hasTrack: Boolean get() = attachmentId != null
}

/** Ce qui peut arriver à la lecture ; le réducteur en tire le nouvel état, sans effet de bord. */
public sealed interface AudioPlaybackAction {

    /**
     * Un autre vocal est demandé : l'ancien état tombe ET l'identifiant bascule dans la MÊME
     * transition (un double appui ne résout jamais un identifiant périmé). La vitesse survit.
     */
    public data class LoadRequested(val attachmentId: String?) : AudioPlaybackAction

    /** La source est prête : la durée est connue, la lecture démarre à [startPositionMs] (reprise). */
    public data class Prepared(val durationMs: Long, val startPositionMs: Long = 0L) : AudioPlaybackAction

    /** Échantillon de position, émis pendant la lecture seulement. */
    public data class Tick(val positionMs: Long) : AudioPlaybackAction

    public data object Paused : AudioPlaybackAction
    public data object Resumed : AudioPlaybackAction
    public data class SeekToFraction(val fraction: Double) : AudioPlaybackAction
    public data class SeekToMs(val positionMs: Long) : AudioPlaybackAction
    public data class SkipBy(val deltaMs: Long) : AudioPlaybackAction
    public data class SpeedSet(val speed: PlaybackSpeed) : AudioPlaybackAction
    public data object SpeedCycled : AudioPlaybackAction
    public data class LoopSet(val loop: Boolean) : AudioPlaybackAction

    /** Fin naturelle : repart de zéro en boucle, sinon revient au repos (le vocal reste chargé). */
    public data object Ended : AudioPlaybackAction

    /** Échec de chargement ou de lecture : le chargement s'achève, rien ne plante. */
    public data object Failed : AudioPlaybackAction

    /** Arrêt : plus aucun vocal chargé. La vitesse choisie survit. */
    public data object Stopped : AudioPlaybackAction

    /**
     * #15969 — le vocal chargé a été accusé : il s'appelle désormais [attachmentId] (id serveur). Lecture, position et
     * durée restent telles quelles ; sans vocal chargé, rien ne change.
     */
    public data class Relabeled(val attachmentId: String) : AudioPlaybackAction
}

public object AudioPlaybackReducer {

    public fun reduce(state: AudioPlaybackState, action: AudioPlaybackAction): AudioPlaybackState = when (action) {
        is AudioPlaybackAction.LoadRequested -> AudioPlaybackState(
            attachmentId = action.attachmentId,
            isLoading = true,
            speed = state.speed,
        )

        is AudioPlaybackAction.Prepared -> {
            val duration = action.durationMs.coerceAtLeast(0L)
            state.copy(
                isLoading = false,
                isPlaying = true,
                durationMs = duration,
                currentTimeMs = clamp(action.startPositionMs, duration),
            )
        }

        is AudioPlaybackAction.Tick ->
            if (state.isPlaying) state.copy(currentTimeMs = clamp(action.positionMs, state.durationMs)) else state

        AudioPlaybackAction.Paused -> if (state.isPlaying) state.copy(isPlaying = false) else state

        AudioPlaybackAction.Resumed ->
            if (state.hasTrack && state.durationMs > 0L && !state.isPlaying) state.copy(isPlaying = true) else state

        is AudioPlaybackAction.SeekToFraction ->
            if (state.durationMs > 0L) {
                val fraction = if (action.fraction.isNaN()) 0.0 else action.fraction.coerceIn(0.0, 1.0)
                state.copy(currentTimeMs = clamp((fraction * state.durationMs).toLong(), state.durationMs))
            } else {
                state
            }

        is AudioPlaybackAction.SeekToMs ->
            if (state.durationMs > 0L) state.copy(currentTimeMs = clamp(action.positionMs, state.durationMs)) else state

        is AudioPlaybackAction.SkipBy ->
            if (state.durationMs > 0L) {
                state.copy(currentTimeMs = clamp(state.currentTimeMs + action.deltaMs, state.durationMs))
            } else {
                state
            }

        is AudioPlaybackAction.SpeedSet -> state.copy(speed = action.speed)
        AudioPlaybackAction.SpeedCycled -> state.copy(speed = state.speed.next())
        is AudioPlaybackAction.LoopSet -> state.copy(shouldLoop = action.loop)

        AudioPlaybackAction.Ended ->
            if (state.shouldLoop) state.copy(isPlaying = true, currentTimeMs = 0L)
            else state.copy(isPlaying = false, isLoading = false, currentTimeMs = 0L)

        AudioPlaybackAction.Failed -> state.copy(isLoading = false, isPlaying = false)

        AudioPlaybackAction.Stopped -> AudioPlaybackState(speed = state.speed)

        is AudioPlaybackAction.Relabeled -> if (state.hasTrack) state.copy(attachmentId = action.attachmentId) else state
    }

    private fun clamp(positionMs: Long, durationMs: Long): Long =
        if (durationMs > 0L) positionMs.coerceIn(0L, durationMs) else positionMs.coerceAtLeast(0L)
}
