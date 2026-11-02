package me.meeshy.sdk.model.composer.look

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.tanh
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.sdk.model.media.MediaTrimBounds

/**
 * **LE SON DE LA PRISE** (#9754) — miroir de `ComposerTakeSound` (iOS) : un gain réglé à la ligne de volume,
 * de 0 à 200 % avec 100 % au MILIEU de la piste, et un muet qui coupe sans oublier le gain.
 */
public data class ComposerTakeSound(val gain: Double = 1.0, val muted: Boolean = false) {

    /** Ce que l'oreille entend et ce que le rendu grave. */
    public val effectiveGain: Double get() = if (muted) 0.0 else clamped(gain)

    /** Rien n'a été touché : le rendu garde la piste telle qu'elle est. */
    public val isUntouched: Boolean get() = effectiveGain == 1.0

    public fun toggledMute(): ComposerTakeSound = copy(muted = !muted)

    public companion object {
        public const val MIN_GAIN: Double = 0.0
        public const val MAX_GAIN: Double = 2.0
        public const val ACCESSIBILITY_STEP: Double = 0.1

        public fun clamped(gain: Double): Double = if (!gain.isFinite()) 1.0 else min(MAX_GAIN, max(MIN_GAIN, gain))

        /** Le doigt à [y] sur une piste de [height] : en haut 200 %, au milieu le son tel quel, en bas le silence. */
        public fun gain(atY: Double, height: Double): Double {
            if (height <= 0) return 1.0
            return clamped(MAX_GAIN * (1 - min(max(atY / height, 0.0), 1.0)))
        }

        /** Où se trace la ligne de volume, depuis le haut de la piste. */
        public fun lineY(gain: Double, height: Double): Double = (1 - clamped(gain) / MAX_GAIN) * max(0.0, height)

        public fun stepped(gain: Double, up: Boolean): Double = clamped(gain + if (up) ACCESSIBILITY_STEP else -ACCESSIBILITY_STEP)

        public fun percent(gain: Double): Int = (clamped(gain) * 100).roundToInt()
    }
}

/**
 * **LE GAIN QU'ON ENTEND EST CELUI QUI PART** (#10360) — miroir de `ComposerTakeGain` : une ATTÉNUATION (0…1,
 * le volume du lecteur) et une AMPLIFICATION (1…2) écrêtée en douceur au-delà du genou.
 */
public object ComposerTakeGain {
    public const val KNEE: Float = 0.8f

    public fun volume(gain: Float): Float = if (!gain.isFinite()) 1f else min(1f, max(0f, gain))

    public fun boost(gain: Float): Float = if (!gain.isFinite()) 1f else max(1f, min(ComposerTakeSound.MAX_GAIN.toFloat(), gain))

    public fun amplified(sample: Float, boost: Float): Float {
        if (boost <= 1f || !sample.isFinite()) return sample
        val raised = sample * boost
        val amplitude = abs(raised)
        if (amplitude <= KNEE) return raised
        val margin = 1 - KNEE
        val soft = KNEE + margin * tanh((amplitude - KNEE) / margin)
        return if (raised < 0) -soft else soft
    }
}

/** Les proportions par presets (#9567) — miroir de `ComposerCropPreset` : « Original » lit le média. */
public enum class ComposerCropPreset(public val notation: String?) {
    ORIGINAL(null),
    STORY("9:16"),
    PORTRAIT("4:5"),
    SQUARE("1:1"),
    LANDSCAPE("16:9");

    /** Largeur / hauteur ; « Original » rend celle de la source, bornée à 0,4…2,5. */
    public fun aspect(sourceWidth: Double, sourceHeight: Double): Double = when (this) {
        ORIGINAL -> if (sourceWidth > 0 && sourceHeight > 0) clampedAspect(sourceWidth / sourceHeight) else 9.0 / 16
        STORY -> 9.0 / 16
        PORTRAIT -> 4.0 / 5
        SQUARE -> 1.0
        LANDSCAPE -> 16.0 / 9
    }

    public companion object {
        public const val MIN_ASPECT: Double = 0.4
        public const val MAX_ASPECT: Double = 2.5

        public fun clampedAspect(aspect: Double): Double = if (!aspect.isFinite()) 1.0 else min(MAX_ASPECT, max(MIN_ASPECT, aspect))

        /** Le preset que ces proportions réalisent ; `null` pour un recadrage libre. */
        public fun matching(aspect: Double, sourceWidth: Double, sourceHeight: Double): ComposerCropPreset? =
            entries.firstOrNull { abs(it.aspect(sourceWidth, sourceHeight) - aspect) < 0.005 }

        /**
         * Le recadrage normalisé le plus grand, centré, aux proportions [aspect] dans une source de
         * [sourceWidth] × [sourceHeight] ; `null` quand il couvre la source entière.
         */
        public fun centeredCrop(aspect: Double, sourceWidth: Double, sourceHeight: Double): NormalizedCrop? {
            if (sourceWidth <= 0 || sourceHeight <= 0 || aspect <= 0) return null
            val source = sourceWidth / sourceHeight
            val width = if (aspect < source) aspect / source else 1.0
            val height = if (aspect < source) 1.0 else source / aspect
            if (width > 0.995 && height > 0.995) return null
            return NormalizedCrop(((1 - width) / 2).toFloat(), ((1 - height) / 2).toFloat(), width.toFloat(), height.toFloat())
        }
    }
}

/**
 * **CE QUE LE RENDU D'UNE VIDÉO GRAVE** — la fenêtre de coupe, le son et le recadrage, une seule recette pour
 * l'aperçu et l'export. Intouchée, la vidéo part telle quelle, sans ré-encodage.
 */
public data class ComposerVideoEdit(
    val durationSeconds: Double,
    val trim: MediaTrimBounds? = null,
    val sound: ComposerTakeSound = ComposerTakeSound(),
    val crop: NormalizedCrop? = null,
) {
    /** La fenêtre lue et gravée ; la vidéo entière sans coupe. */
    public val window: MediaTrimBounds get() = trim ?: MediaTrimBounds(0.0, max(0.0, durationSeconds))

    public val isTrimmed: Boolean get() = trim?.persisted(durationSeconds) != null

    public val isUntouched: Boolean get() = !isTrimmed && sound.isUntouched && crop == null

    /** Les bornes en millisecondes pour le découpage du rendu. */
    public val clipStartMs: Long get() = (window.start * 1000).roundToInt().toLong()
    public val clipEndMs: Long get() = (window.end * 1000).roundToInt().toLong()

    /** Le muet retire la piste ; sinon le gain se grave. */
    public val removesAudio: Boolean get() = sound.muted || sound.effectiveGain == 0.0
}
