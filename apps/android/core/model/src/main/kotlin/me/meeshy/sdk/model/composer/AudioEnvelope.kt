package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.scene.VolumeRamp

/**
 * L'enveloppe de volume d'un clip ENTRÉ en cours de piste — miroir de `AudioEnvelope` (iOS, #6580).
 *
 * Un clip qui entre à `elapsedInClip` dans sa source porte déjà l'amplitude de ce point : un clip entré à la moitié de
 * son fondu d'entrée est à la moitié de son volume, la rampe qui reste ne parcourt que ce qui reste, et passé le
 * déclencheur du fondu de sortie la rampe d'entrée n'existe plus (deux rampes sur un même volume se percuteraient).
 *
 * Pure : éprouvable sans lecteur, sans minuterie ni fichier. Les décalages sont des secondes DEPUIS LE DÉBUT DU CLIP.
 */
public data class AudioEnvelope(
    public val initialVolume: Float,
    public val fadeIn: Ramp?,
    public val fadeOut: Ramp?,
) {

    /** Une rampe de volume à poser. [duration] est ce qu'il RESTE à parcourir, jamais la durée nominale du fondu. */
    public data class Ramp(
        public val from: Float,
        public val to: Float,
        public val startOffset: Double,
        public val duration: Double,
    ) {
        public fun volumeAt(elapsedInClip: Double): Float =
            VolumeRamp.volume(from, to, duration, elapsedInClip - startOffset)
    }

    public companion object {
        /**
         * À `elapsedInClip == 0` : montée `0 -> target` sur [fadeIn], descente `target -> 0` ancrée à
         * `clipDuration - fadeOut`, volume initial nul dès qu'un fondu d'entrée existe.
         */
        public fun plan(
            elapsedInClip: Double,
            fadeIn: Double,
            fadeOut: Double,
            clipDuration: Double,
            target: Float,
        ): AudioEnvelope {
            val entered = sanitized(elapsedInClip)
            val rise = sanitized(fadeIn)
            val fall = sanitized(fadeOut)
            val span = sanitized(clipDuration)

            if (fall > 0) {
                val fallStart = maxOf(0.0, span - fall)
                if (entered >= fallStart) {
                    val travelled = minOf(fall, entered - fallStart)
                    val remaining = fall - travelled
                    val from = target * (1 - travelled / fall).toFloat()
                    if (remaining <= 0) return AudioEnvelope(0f, null, null)
                    return AudioEnvelope(from, null, Ramp(from, 0f, entered, remaining))
                }
            }

            val rising: Ramp?
            val initial: Float
            if (rise > 0 && entered < rise) {
                val from = target * (entered / rise).toFloat()
                rising = Ramp(from, target, entered, rise - entered)
                initial = from
            } else {
                rising = null
                initial = target
            }
            val falling = if (fall > 0) Ramp(target, 0f, maxOf(0.0, span - fall), fall) else null
            return AudioEnvelope(initial, rising, falling)
        }

        private fun sanitized(seconds: Double): Double = if (seconds.isFinite() && seconds > 0) seconds else 0.0
    }
}
