package me.meeshy.sdk.model.recording

import me.meeshy.sdk.model.playback.AudioPlaybackState

public enum class PreviewPlayCommand { LOAD_AND_PLAY, TOGGLE }

/** Ce que l'aperçu montre de la lecture, projeté depuis l'état du moteur unique. */
public data class PreviewPlaybackView(
    val isPlaying: Boolean,
    val isLoading: Boolean,
    val fraction: Double,
    val elapsedSeconds: Double,
    val durationSeconds: Double,
)

/**
 * L'aperçu d'une prise se joue par le moteur audio unique (un seul vocal sonne à la fois) : tant que le
 * moteur porte un AUTRE vocal, l'aperçu paraît au repos ; le premier appui charge la prise, les suivants
 * basculent lecture et pause.
 */
public object RecordingPreviewPlaybackLaw {
    public fun command(state: AudioPlaybackState, previewId: String): PreviewPlayCommand =
        if (state.attachmentId == previewId) PreviewPlayCommand.TOGGLE else PreviewPlayCommand.LOAD_AND_PLAY

    public fun view(state: AudioPlaybackState, previewId: String, recordedDurationSeconds: Double): PreviewPlaybackView {
        if (state.attachmentId != previewId) {
            return PreviewPlaybackView(false, false, 0.0, 0.0, recordedDurationSeconds)
        }
        val duration = if (state.durationMs > 0L) state.durationMs / MS else recordedDurationSeconds
        return PreviewPlaybackView(state.isPlaying, state.isLoading, state.progress, state.currentTimeMs / MS, duration)
    }

    private const val MS = 1000.0
}
