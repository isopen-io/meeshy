package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaKind
import me.meeshy.sdk.model.media.DeviceMediaTier

/** Ce que la lecture d'une slide exige de son horloge. */
public enum class ScenePlaybackCadenceTier { HIGH, LOW }

/** Plage de cadence (Hz) demandée à l'écran : minimum, maximum, préférée. */
public data class SceneFrameRateRange(val minimum: Int, val maximum: Int, val preferred: Int)

/**
 * Une slide immobile ne tient plus l'écran à 60–120 Hz — miroir de `StoryPlaybackCadence.swift` (#9864).
 * Le palier est haut seulement quand quelque chose suit le playhead image par image : vidéo, son, keyframes, fondus,
 * sticker animé, transition, ou un hôte qui lit le temps de lecture.
 */
public object ScenePlaybackCadence {

    /** Durée des transitions d'ouverture/fermeture de slide (secondes). */
    public const val TRANSITION_DURATION_SECONDS: Double = 1.2

    /** Le palier remonte un peu AVANT la fenêtre de fermeture pour que sa première image ne tombe pas sur un tick lent. */
    public const val CLOSING_LEAD_SECONDS: Double = 0.25

    public fun tier(
        effects: StoryEffects,
        elapsed: Double,
        totalDuration: Double,
        backgroundIsVideo: Boolean,
        hasSchedulableAudio: Boolean,
        relaysPlaybackClock: Boolean,
    ): ScenePlaybackCadenceTier {
        if (backgroundIsVideo || hasSchedulableAudio || relaysPlaybackClock) return ScenePlaybackCadenceTier.HIGH
        if (effects.opening != null && elapsed < TRANSITION_DURATION_SECONDS) return ScenePlaybackCadenceTier.HIGH
        if (effects.closing != null && closingProgress(totalDuration, elapsed + CLOSING_LEAD_SECONDS) > 0.0) {
            return ScenePlaybackCadenceTier.HIGH
        }
        return if (carriesTimedContent(effects)) ScenePlaybackCadenceTier.HIGH else ScenePlaybackCadenceTier.LOW
    }

    public fun closingProgress(totalDuration: Double, elapsed: Double): Double {
        if (!totalDuration.isFinite() || totalDuration <= 0.0) return 0.0
        val start = totalDuration - TRANSITION_DURATION_SECONDS
        if (elapsed <= start) return 0.0
        return minOf(1.0, (elapsed - start) / TRANSITION_DURATION_SECONDS)
    }

    /** Plage de cadence selon le palier et le tier de l'appareil : une cadence stable vaut mieux qu'une haute qui saccade. */
    public fun frameRateRange(tier: ScenePlaybackCadenceTier, mediaTier: DeviceMediaTier): SceneFrameRateRange =
        when (tier) {
            ScenePlaybackCadenceTier.LOW -> SceneFrameRateRange(10, 30, 30)
            ScenePlaybackCadenceTier.HIGH -> when (mediaTier) {
                DeviceMediaTier.LOW -> SceneFrameRateRange(30, 60, 30)
                DeviceMediaTier.MID -> SceneFrameRateRange(30, 60, 60)
                DeviceMediaTier.HIGH, DeviceMediaTier.PRO -> SceneFrameRateRange(60, 120, 60)
            }
        }

    public fun hasFade(fadeIn: Double?, fadeOut: Double?): Boolean = (fadeIn ?: 0.0) > 0.0 || (fadeOut ?: 0.0) > 0.0

    private fun carriesTimedContent(effects: StoryEffects): Boolean {
        if (!effects.clipTransitions.isNullOrEmpty()) return true
        val timedText = effects.textObjects.any { hasFade(it.fadeIn, it.fadeOut) || !it.keyframes.isNullOrEmpty() }
        val timedMedia = effects.mediaObjects.orEmpty().any {
            it.kind == StoryMediaKind.VIDEO || hasFade(it.fadeIn, it.fadeOut) || !it.keyframes.isNullOrEmpty()
        }
        val timedSticker = effects.stickerObjects.orEmpty().any {
            it.animation != null || hasFade(it.fadeIn, it.fadeOut)
        }
        val timedPlace = effects.locationObjects.any { hasFade(it.fadeIn, it.fadeOut) }
        return timedText || timedMedia || timedSticker || timedPlace
    }
}
