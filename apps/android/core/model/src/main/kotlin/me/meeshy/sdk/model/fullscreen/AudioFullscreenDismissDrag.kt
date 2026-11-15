package me.meeshy.sdk.model.fullscreen

import kotlin.math.abs

/**
 * Loi du glissement de fermeture du plein écran audio (miroir de `AudioFullscreenDismissRule`).
 * Il ne s'arme que pour un geste vertical franc vers le bas ; il cède au pager horizontal et à
 * la transcription défilante.
 */
public object AudioFullscreenDismissDrag {

    /** L'écran suit le doigt à 60 % : la résistance dit qu'on peut revenir. */
    public const val FOLLOW: Float = 0.6f

    /** Un geste doux ne ferme qu'après la moitié de la hauteur. */
    public const val SLOW_FRACTION: Float = 0.5f

    /** Un coup sec vers le bas ferme tout de suite (px/s). */
    public const val FLICK_VELOCITY: Float = 1_500f

    /** Distance minimale d'un flick (px). */
    public const val FLICK_DISTANCE: Float = 40f

    /** Rapport vertical/horizontal à partir duquel un glissement est vertical. */
    public const val VERTICAL_SLOPE: Float = 1.5f

    public fun dismisses(translation: Float, velocity: Float, height: Float): Boolean {
        if (translation >= FLICK_DISTANCE && velocity >= FLICK_VELOCITY) return true
        return height > 0f && translation >= height * SLOW_FRACTION
    }

    /** Descend, et nettement plus qu'il ne part de côté : un balayage de page en biais reste un balayage. */
    public fun arms(velocityX: Float, velocityY: Float): Boolean =
        velocityY > 0f && abs(velocityY) > abs(velocityX) * VERTICAL_SLOPE

    /**
     * Le geste peut-il COMMENCER ? Non si la pente n'est pas verticale, ni si le doigt part d'une
     * transcription qui défile et n'est pas en haut de sa course.
     */
    public fun canBegin(velocityX: Float, velocityY: Float, startsInScrolledTranscript: Boolean): Boolean =
        arms(velocityX, velocityY) && !startsInScrolledTranscript

    /** Décalage suivi pendant le glissement : jamais vers le haut, ralenti par [FOLLOW]. */
    public fun offset(translation: Float): Float = if (translation > 0f) translation * FOLLOW else 0f
}
