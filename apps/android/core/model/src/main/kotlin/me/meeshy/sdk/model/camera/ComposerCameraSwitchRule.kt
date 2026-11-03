package me.meeshy.sdk.model.camera

import kotlin.math.abs

/**
 * Basculer d'objectif sans écran noir (miroir de `ComposerCameraSwitchRule` iOS, #9464).
 *
 * Le temps que le nouvel objectif serve sa première image, l'aperçu montre la dernière trame de l'ancien, floutée,
 * et le bouton de bascule se tait : un second toucher ne relance pas une bascule pendant que la première se fait.
 */
object ComposerCameraSwitchRule {
    /** Ce que la couverture reste après la pose du nouvel objectif. */
    const val COVER_HOLD_MS: Long = 200

    /** L'attente au plus d'une trame de l'objectif encore en place. */
    const val FRAME_WAIT_MS: Long = 120

    /** Une prise basculée attend que la nouvelle connexion puisse écrire — au plus ce temps. */
    const val SEGMENT_RESUME_WAIT_MS: Long = 600

    /** Une couverture floutée n'a pas besoin de détail : une petite image suffit. */
    const val COVER_WIDTH_PX: Int = 270

    const val COVER_BLUR: Float = 18f

    private const val ZOOM_EPSILON = 0.001f

    fun mayFlip(isSwitching: Boolean): Boolean = !isSwitching

    /** Le bouton se grise pendant la bascule. */
    fun flipEnabled(isSwitching: Boolean): Boolean = mayFlip(isSwitching)

    /** La trame que le guetteur retient déjà, sans attendre ; sinon la prochaine de l'objectif en place. */
    fun <Frame : Any> coverFrame(latest: Frame?, hold: () -> Frame?): Frame? = latest ?: hold()

    /** La validation peut rendre l'objectif à son zoom d'ouverture : ré-affirmer ne coûte que si l'ouverture a bougé. */
    fun needsZoomReassert(current: Float, target: Float): Boolean = abs(current - target) > ZOOM_EPSILON

    /** Largeur de la couverture : jamais agrandie. */
    fun coverWidth(frameWidth: Int): Int = if (frameWidth <= 0) 0 else minOf(COVER_WIDTH_PX, frameWidth)
}
