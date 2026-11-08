package me.meeshy.sdk.model.imageedit

import kotlin.math.max
import kotlin.math.min

/**
 * La transformation d'inspection du canevas (zoom + déplacement) : purement visuelle, jamais
 * cuite dans l'image. Miroir des gestes de zoom d'iOS `MeeshyImageEditorView`.
 */
public data class ImageEditorInspection(
    val zoom: Float = 1f,
    val panX: Float = 0f,
    val panY: Float = 0f,
) {
    public val isZoomed: Boolean get() = zoom > 1f

    /** Un pincement : le zoom ancré × l'échelle du geste, borné. */
    public fun pinched(anchorZoom: Float, scale: Float): ImageEditorInspection =
        copy(zoom = (anchorZoom * scale).coerceIn(MIN_ZOOM, MAX_ZOOM))

    /** Un déplacement : sans zoom, il n'y a rien à déplacer. */
    public fun panned(dx: Float, dy: Float): ImageEditorInspection =
        if (!isZoomed) this else copy(panX = panX + dx, panY = panY + dy)

    /** Fin de pincement : revenir à 1 (ou presque) rend l'image à sa place. */
    public fun settled(): ImageEditorInspection = if (zoom <= SNAP_BACK) IDENTITY else this

    /** Double tap : zoomé → retour, sinon zoom à [DOUBLE_TAP_ZOOM]. */
    public fun doubleTapped(): ImageEditorInspection =
        if (isZoomed) IDENTITY else copy(zoom = DOUBLE_TAP_ZOOM)

    public companion object {
        public const val MIN_ZOOM: Float = 1f
        public const val MAX_ZOOM: Float = 6f
        public const val DOUBLE_TAP_ZOOM: Float = 2.4f
        public const val SNAP_BACK: Float = 1.01f
        public val IDENTITY: ImageEditorInspection = ImageEditorInspection()
    }
}

/** Le geste « comparer à l'original » : appui long de 250 ms, tolérance de 30 dp. */
public object ImageEditorCompare {
    public const val HOLD_MILLIS: Long = 250L
    public const val MAX_DISTANCE_DP: Float = 30f

    /** Comparer n'a de sens que s'il y a une retouche à comparer. */
    public fun canBegin(hasEdits: Boolean): Boolean = hasEdits
}

/** Géométrie d'affichage de l'image dans le canevas. */
public object ImageEditorGeometry {
    /** Le rectangle de l'image contenue (« fit ») et centrée dans un conteneur. */
    public fun fittedRect(imageWidth: Float, imageHeight: Float, containerWidth: Float, containerHeight: Float): CropRect {
        if (imageWidth <= 0f || imageHeight <= 0f || containerWidth <= 0f || containerHeight <= 0f) {
            return CropRect(0f, 0f, max(containerWidth, 1f), max(containerHeight, 1f))
        }
        val imageAspect = imageWidth / imageHeight
        val containerAspect = containerWidth / containerHeight
        val (w, h) = if (imageAspect > containerAspect) {
            containerWidth to containerWidth / imageAspect
        } else {
            containerHeight * imageAspect to containerHeight
        }
        return CropRect((containerWidth - w) / 2f, (containerHeight - h) / 2f, w, h)
    }

    /** Hauteur utile du canevas : sans contrôleur, de quoi loger la grappe de FAB ; avec, au plus 52 % de la fenêtre (320 dp). */
    public fun canvasHeight(windowHeight: Float, controllerOpen: Boolean, topInset: Float = TOP_INSET, fabInset: Float = FAB_INSET): Float {
        val bottom = if (controllerOpen) min(windowHeight * 0.52f, MAX_CONTROLLER) else fabInset
        return max(windowHeight - topInset - bottom, MIN_CANVAS)
    }

    private const val TOP_INSET = 60f
    private const val FAB_INSET = 92f
    private const val MAX_CONTROLLER = 320f
    private const val MIN_CANVAS = 140f
}
