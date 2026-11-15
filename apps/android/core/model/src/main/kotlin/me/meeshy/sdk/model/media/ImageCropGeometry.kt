package me.meeshy.sdk.model.media

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Le cadre de recadrage, en pixels d'écran : un cercle (avatar) ou un rectangle large (bannière). */
public data class CropFrameSize(
    val widthPx: Float,
    val heightPx: Float,
    val circular: Boolean = false,
)

/** La pose de l'image sous le cadre : [zoom] au-dessus du « cover » (1 = cover), décalage du centre de l'image en pixels d'écran. */
public data class CropTransform(val zoom: Float, val offsetX: Float, val offsetY: Float) {

    /** Glisse l'image ; le décalage reste dans les bornes qui interdisent tout vide dans le cadre. */
    public fun panned(dx: Float, dy: Float, imageW: Int, imageH: Int, frame: CropFrameSize): CropTransform =
        copy(offsetX = offsetX + dx, offsetY = offsetY + dy).constrained(imageW, imageH, frame)

    /** Multiplie le zoom par [factor], borné ; le décalage est ramené dans les nouvelles bornes. */
    public fun zoomed(factor: Float, imageW: Int, imageH: Int, frame: CropFrameSize): CropTransform =
        copy(zoom = (zoom * factor).coerceIn(ImageCropGeometry.MIN_ZOOM, ImageCropGeometry.MAX_ZOOM))
            .constrained(imageW, imageH, frame)

    public fun nudged(direction: CropNudge, imageW: Int, imageH: Int, frame: CropFrameSize): CropTransform {
        val step = ImageCropGeometry.NUDGE_STEP_PX
        return when (direction) {
            CropNudge.LEFT -> panned(-step, 0f, imageW, imageH, frame)
            CropNudge.RIGHT -> panned(step, 0f, imageW, imageH, frame)
            CropNudge.UP -> panned(0f, -step, imageW, imageH, frame)
            CropNudge.DOWN -> panned(0f, step, imageW, imageH, frame)
        }
    }

    public fun constrained(imageW: Int, imageH: Int, frame: CropFrameSize): CropTransform {
        val scale = ImageCropGeometry.coverScale(imageW, imageH, frame) * zoom
        val maxX = max(0f, (imageW * scale - frame.widthPx) / 2f)
        val maxY = max(0f, (imageH * scale - frame.heightPx) / 2f)
        return copy(offsetX = offsetX.coerceIn(-maxX, maxX), offsetY = offsetY.coerceIn(-maxY, maxY))
    }

    public companion object {
        public fun initial(): CropTransform = CropTransform(zoom = 1f, offsetX = 0f, offsetY = 0f)
    }
}

public enum class CropNudge { LEFT, RIGHT, UP, DOWN }

/** Le rectangle de recadrage en pixels de la SOURCE. */
public data class CropSourceRect(val leftPx: Int, val topPx: Int, val widthPx: Int, val heightPx: Int)

/**
 * La géométrie pure du recadrage (contrainte « cover » : l'image ne laisse jamais de vide dans le cadre).
 * Aucune dépendance Android — le Compose et le Bitmap ne font que projeter ce que cet objet décide.
 */
public object ImageCropGeometry {
    public const val MIN_ZOOM: Float = 1f
    public const val MAX_ZOOM: Float = 8f
    public const val NUDGE_STEP_PX: Float = 24f
    private const val AVATAR_FRAME_FRACTION = 0.84f
    private const val BANNER_HEIGHT_DP = 130f

    /** La bannière : largeur de l'écran × 130 dp. */
    public fun bannerFrame(screenWidthPx: Float, densityScale: Float): CropFrameSize =
        CropFrameSize(screenWidthPx, BANNER_HEIGHT_DP * densityScale, circular = false)

    /** L'avatar : le plus grand cercle de la zone libre, avec une marge. */
    public fun avatarFrame(availableWidthPx: Float, availableHeightPx: Float): CropFrameSize {
        val side = min(availableWidthPx, availableHeightPx) * AVATAR_FRAME_FRACTION
        return CropFrameSize(side, side, circular = true)
    }

    /** Pixels d'écran par pixel source pour que l'image couvre le cadre exactement (zoom 1). */
    public fun coverScale(imageW: Int, imageH: Int, frame: CropFrameSize): Float {
        if (imageW <= 0 || imageH <= 0) return 1f
        return max(frame.widthPx / imageW, frame.heightPx / imageH)
    }

    public fun sourceRect(imageW: Int, imageH: Int, frame: CropFrameSize, transform: CropTransform): CropSourceRect {
        if (imageW <= 0 || imageH <= 0) return CropSourceRect(0, 0, 0, 0)
        val t = transform.constrained(imageW, imageH, frame)
        val scale = coverScale(imageW, imageH, frame) * t.zoom
        val width = min(imageW.toFloat(), frame.widthPx / scale)
        val height = min(imageH.toFloat(), frame.heightPx / scale)
        val left = (imageW - width) / 2f - t.offsetX / scale
        val top = (imageH - height) / 2f - t.offsetY / scale
        val l = floor(left).toInt().coerceIn(0, imageW - 1)
        val tp = floor(top).toInt().coerceIn(0, imageH - 1)
        val w = Math.round(width).coerceIn(1, imageW - l)
        val h = Math.round(height).coerceIn(1, imageH - tp)
        return CropSourceRect(l, tp, w, h)
    }
}
