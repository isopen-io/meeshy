package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.MediaResumeMerge

/**
 * **La progression d'UNE page du plein écran audio.** La page que le moteur joue suit le moteur ; toute autre montre sa
 * position AU REPOS — la position mémorisée par l'appareil, sinon la consommation servie ([MediaResumeMerge.restingFraction],
 * la même précédence que la bulle : le local gagne dès qu'il existe, le serveur ne comble que son absence).
 */
public object AudioFullscreenPageProgress {

    public fun fraction(
        pageAttachmentId: String,
        engine: AudioPlaybackState,
        localPositionMs: Long?,
        served: MeeshyMediaConsumption?,
        declaredDurationMs: Long,
    ): Double {
        if (engine.attachmentId == pageAttachmentId && engine.durationMs > 0L) return engine.progress
        val localFraction = localPositionMs?.takeIf { declaredDurationMs > 0L }?.let { it.toDouble() / declaredDurationMs }
        return MediaResumeMerge.restingFraction(localFraction, served, MediaResumeMerge.Medium.Audio, declaredDurationMs)
    }
}
