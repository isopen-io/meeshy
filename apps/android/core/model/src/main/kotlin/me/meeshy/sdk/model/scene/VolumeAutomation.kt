package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe

/**
 * Source de vérité UNIQUE du volume d'un clip à un instant — miroir de
 * `StoryVolumeResolver` (iOS). Pure : lecture, export et aperçu timeline la partagent.
 */
object VolumeAutomation {

    /**
     * Volume effectif à [time] (secondes **relatives au début du clip**), dans `0..MAX_GAIN`.
     * Rend [base] sans point de volume, ou tant que le playhead précède le premier point
     * (sinon l'ouverture sauterait d'un coup à la valeur du premier point).
     */
    fun effectiveVolume(base: Float, keyframes: List<StoryKeyframe>?, time: Float): Float {
        val points = keyframes.orEmpty().mapNotNull { kf ->
            kf.volume?.let { KeyframeChannelSample(kf.time, it.toDouble(), kf.easing ?: StoryEasing.LINEAR) }
        }
        val first = points.minByOrNull { it.time } ?: return StoryVolume.clamp(base)
        if (time < first.time) return StoryVolume.clamp(base)
        val value = StoryKeyframeInterpolator.interpolate(points, time) ?: return StoryVolume.clamp(base)
        return StoryVolume.clamp(value.toFloat())
    }

    /** Atténuation d'affichage par-dessus un volume résolu ; jamais écrite dans le modèle. */
    fun ducked(volume: Float, isDucking: Boolean): Float =
        if (isDucking) StoryVolume.clamp(volume * StoryVolume.DUCKING_FACTOR) else volume

    /** `isDuckingDisabled == null` vaut « atténuation active » (aucune story publiée ne porte le champ). */
    fun isDucking(slideDucks: Boolean, isDuckingDisabled: Boolean?): Boolean =
        slideDucks && isDuckingDisabled != true
}

/** Courbe des fondus : le volume se LIT sur le temps réel écoulé, jamais sur un nombre de pas. */
object VolumeRamp {
    fun volume(start: Float, end: Float, duration: Double, elapsed: Double): Float {
        if (!duration.isFinite() || duration <= 0.0 || !elapsed.isFinite()) return end
        val progress = (elapsed / duration).coerceIn(0.0, 1.0).toFloat()
        return start + (end - start) * progress
    }

    fun isComplete(duration: Double, elapsed: Double): Boolean = !(elapsed < duration)
}
