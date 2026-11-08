package me.meeshy.sdk.model.fullscreen

import kotlin.math.abs

/** Ce que décide la levée du doigt après un glissement vertical sur l'image. */
public sealed interface ImageViewerDismissOutcome {
    /** Course trop courte et geste trop lent : l'image revient en ressort. */
    public data object SpringBack : ImageViewerDismissOutcome

    /** On ferme la visionneuse. */
    public data object Dismiss : ImageViewerDismissOutcome
}

/**
 * La loi de fermeture par glissement vertical de la visionneuse d'image — miroir de
 * `ImageViewerView.swift` (`scale <= 1.05 && abs(translation.height) > 200`).
 *
 * Rien n'est décidé avant la levée du doigt : pendant le geste l'image suit le doigt et le fond
 * s'éclaircit ([backdropAlpha]) ; à la levée, [outcome] ferme au-delà de [DISMISS_DISTANCE] ou si
 * le geste est lancé (vitesse), sinon l'image revient en ressort. Les unités sont des dp.
 */
public object ImageViewerDismissLaw {

    /** Course verticale au-delà de laquelle on ferme (iOS : 200 pt). */
    public const val DISMISS_DISTANCE: Float = 200f

    /** Échelle au-delà de laquelle l'image se déplace au lieu de se fermer (iOS : 1,05). */
    public const val REST_SCALE_CEILING: Float = 1.05f

    /** Vitesse verticale (dp/s) à partir de laquelle un geste est « lancé ». */
    public const val FLING_VELOCITY: Float = 1200f

    /** Une course minimale (dp) sous laquelle une vitesse seule ne ferme pas : un tremblement n'est pas un lancer. */
    public const val FLING_MIN_TRAVEL: Float = 40f

    /** Le glissement de fermeture n'existe qu'au repos ou presque. */
    public fun isDragEnabled(scale: Float): Boolean = scale <= REST_SCALE_CEILING

    /** Avancement du geste, de 0 (au repos) à 1 (seuil atteint). */
    public fun progress(travel: Float): Float = (abs(travel) / DISMISS_DISTANCE).coerceIn(0f, 1f)

    /** Opacité du fond noir : il s'éclaircit à mesure que l'image s'éloigne, sans jamais devenir transparent. */
    public fun backdropAlpha(travel: Float): Float = 1f - MAX_BACKDROP_FADE * progress(travel)

    public fun outcome(travel: Float, velocity: Float, scale: Float): ImageViewerDismissOutcome {
        if (!isDragEnabled(scale)) return ImageViewerDismissOutcome.SpringBack
        val distance = abs(travel)
        val launched = abs(velocity) > FLING_VELOCITY && distance > FLING_MIN_TRAVEL && sameDirection(travel, velocity)
        return if (distance > DISMISS_DISTANCE || launched) ImageViewerDismissOutcome.Dismiss
        else ImageViewerDismissOutcome.SpringBack
    }

    private fun sameDirection(travel: Float, velocity: Float): Boolean = (travel > 0f) == (velocity > 0f)

    private const val MAX_BACKDROP_FADE: Float = 0.6f
}
