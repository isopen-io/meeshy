package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.media.AudioAvailability
import me.meeshy.sdk.model.media.MediaAvailabilityState
import me.meeshy.sdk.model.media.PlaybackSpeed

/**
 * Ce que la bulle d'un vocal lit du moteur partagé quand c'est SA pièce qui est chargée (iOS `CoordinatedAudioPlayer` :
 * `activeContext?.attachmentId == attachmentId`). Une bulle inactive ne reçoit rien : sa valeur reste `null` et elle ne se
 * recompose pas quand la progression d'une autre bouge.
 */
public data class BubbleVoiceLive(
    val attachmentId: String,
    val isPlaying: Boolean,
    val isLoading: Boolean,
    val fraction: Double,
    val elapsedSeconds: Double,
    val durationSeconds: Double,
    val speed: PlaybackSpeed,
)

/** La projection de l'état du moteur sur une bulle vocale, et son repos tiré de la consommation servie. */
public object BubbleVoiceProjection {

    /** `null` quand le moteur tient une AUTRE pièce (ou aucune) : la bulle inactive ne change pas. */
    public fun live(engine: AudioPlaybackState, attachmentIds: Collection<String>): BubbleVoiceLive? {
        val active = engine.attachmentId ?: return null
        if (active !in attachmentIds) return null
        return BubbleVoiceLive(
            attachmentId = active,
            isPlaying = engine.isPlaying,
            isLoading = engine.isLoading,
            fraction = engine.progress,
            elapsedSeconds = engine.currentTimeMs / MS_PER_SECOND,
            durationSeconds = engine.durationMs.coerceAtLeast(0L) / MS_PER_SECOND,
            speed = engine.speed,
        )
    }

    /** Au repos : la fraction déjà écoutée ; pleine une fois le vocal écouté jusqu'au bout (iOS `restingFraction`). */
    public fun restingFraction(lastPlayPositionMs: Int?, listenedComplete: Boolean, durationMs: Long): Double = when {
        listenedComplete -> 1.0
        lastPlayPositionMs == null || durationMs <= 0L -> 0.0
        else -> (lastPlayPositionMs.toDouble() / durationMs).coerceIn(0.0, 1.0)
    }

    /** Là où la lecture reprendra ; `null` quand elle repart du début (rien d'écouté, ou écouté jusqu'au bout). */
    public fun resumeSeconds(lastPlayPositionMs: Int?, listenedComplete: Boolean, durationMs: Long): Double? {
        if (listenedComplete || lastPlayPositionMs == null || lastPlayPositionMs <= 0) return null
        val bounded = if (durationMs > 0L) lastPlayPositionMs.toLong().coerceAtMost(durationMs) else lastPlayPositionMs.toLong()
        return bounded / MS_PER_SECOND
    }

    /** Le bouton de tête du lecteur : prêt, taille à télécharger, ou anneau de progression. Un échec se relance. */
    public fun availability(state: MediaAvailabilityState): AudioAvailability = when (state) {
        MediaAvailabilityState.Ready -> AudioAvailability.Ready
        is MediaAvailabilityState.NeedsDownload -> AudioAvailability.NeedsDownload
        is MediaAvailabilityState.Downloading ->
            AudioAvailability.Downloading(state.progress, state.downloadedBytes, state.totalBytes)
        is MediaAvailabilityState.Failed -> AudioAvailability.NeedsDownload
    }

    /** Hors ligne, une pièce qui n'est pas sur l'appareil ne se télécharge pas : le bouton est désactivé. */
    public fun isOfflineBlocked(state: MediaAvailabilityState): Boolean =
        state is MediaAvailabilityState.NeedsDownload && state.offline

    private const val MS_PER_SECOND = 1000.0
}

/** Le toucher d'un vocal : basculer la pièce active, démarrer la file depuis une autre, ou refuser une pièce sans adresse. */
public object VoiceTap {

    public enum class Step { TOGGLE, START_QUEUE, REFUSE }

    public fun step(activeAttachmentId: String?, tappedAttachmentId: String, url: String?): Step = when {
        url.isNullOrBlank() -> Step.REFUSE
        activeAttachmentId == tappedAttachmentId -> Step.TOGGLE
        else -> Step.START_QUEUE
    }
}
