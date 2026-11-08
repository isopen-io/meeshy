package me.meeshy.sdk.model.scene

import kotlin.math.abs

/** Règles pures du zoom du viewport du canevas du composer (pincement à trois doigts), miroir de `CanvasViewportZoomPolicy` iOS. */
public object CanvasViewportZoomPolicy {
    public const val MIN_SCALE: Float = 0.5f
    public const val MAX_SCALE: Float = 4f

    /** Sous cet écart à 1, l'échelle relâchée est l'identité exacte : la barre du haut revient. */
    public const val IDENTITY_SNAP_TOLERANCE: Float = 0.08f

    /** L'échelle retenue au relâchement : bornée à [MIN_SCALE]..[MAX_SCALE], puis aimantée à 1. */
    public fun settledScale(current: Float, gestureScale: Float): Float {
        val raw = (current * gestureScale).coerceIn(MIN_SCALE, MAX_SCALE)
        return if (abs(raw - 1f) < IDENTITY_SNAP_TOLERANCE) 1f else raw
    }

    public fun isZoomed(scale: Float): Boolean = scale != 1f

    /** Un double-tap remet le viewport à 1 seulement s'il est zoomé et que le doigt ne touche aucun objet ; sinon il garde le cycle ajusté / rempli. */
    public fun doubleTapResetsViewport(isViewportZoomed: Boolean, hitItemId: String?): Boolean =
        isViewportZoomed && hitItemId == null
}
