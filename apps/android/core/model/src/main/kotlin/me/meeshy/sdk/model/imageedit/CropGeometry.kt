package me.meeshy.sdk.model.imageedit

import me.meeshy.sdk.model.accessibility.AdjustStep

/** Rectangle en pixels d'écran ; miroir minimal de `CGRect` pour la géométrie du cadre. */
public data class CropRect(
    val left: Float,
    val top: Float,
    val width: Float,
    val height: Float,
) {
    val right: Float get() = left + width
    val bottom: Float get() = top + height
    val centerX: Float get() = left + width / 2f
    val centerY: Float get() = top + height / 2f

    public fun contains(other: CropRect): Boolean =
        other.left >= left && other.top >= top && other.right <= right && other.bottom <= bottom

    public fun containsPoint(x: Float, y: Float): Boolean =
        x >= left && x <= right && y >= top && y <= bottom

    public fun offsetBy(dx: Float, dy: Float): CropRect = copy(left = left + dx, top = top + dy)

    /** Intersection ; un rectangle vide (largeur et hauteur nulles) si les deux ne se recoupent pas. */
    public fun intersect(other: CropRect): CropRect {
        val l = maxOf(left, other.left)
        val t = maxOf(top, other.top)
        val r = minOf(right, other.right)
        val b = minOf(bottom, other.bottom)
        return if (r <= l || b <= t) CropRect(l, t, 0f, 0f) else CropRect(l, t, r - l, b - t)
    }
}

public data class CropSize(val width: Float, val height: Float) {
    public companion object { public val ZERO: CropSize = CropSize(0f, 0f) }
}

public enum class CropOverlayHandle {
    NONE, TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT, TOP, BOTTOM, LEFT, RIGHT, CENTER,
}

public data class CropPercentages(val x: Double, val y: Double, val width: Double, val height: Double)

public enum class CropFrameMove(public val unitX: Float, public val unitY: Float) {
    LEFT(-1f, 0f), RIGHT(1f, 0f), UP(0f, -1f), DOWN(0f, 1f),
}

/** Géométrie pure du cadre de recadrage. Miroir d'iOS `CropGeometry`. */
public object CropGeometry {

    public const val HANDLE_SIZE_DP: Float = 24f
    public const val HANDLE_HIT_AREA_DP: Float = 48f
    public const val MIN_CROP_SIZE_DP: Float = 56f

    public fun resized(
        rect: CropRect,
        handle: CropOverlayHandle,
        translation: CropSize,
        aspectRatio: Double?,
        minSize: Float,
    ): CropRect {
        if (handle == CropOverlayHandle.NONE) return rect
        val tw = translation.width
        val th = translation.height
        val ratio = aspectRatio?.toFloat()
        var x = rect.left
        var y = rect.top
        var w = rect.width
        var h = rect.height
        when (handle) {
            CropOverlayHandle.NONE -> return rect
            CropOverlayHandle.CENTER -> { x += tw; y += th }
            CropOverlayHandle.TOP_LEFT ->
                if (ratio != null) {
                    val d = minOf(tw, th)
                    x += d; y += d / ratio; w -= d; h -= d / ratio
                } else {
                    x += tw; y += th; w -= tw; h -= th
                }
            CropOverlayHandle.TOP_RIGHT ->
                if (ratio != null) {
                    val c = maxOf(tw, -th)
                    y -= c / ratio; w += c; h += c / ratio
                } else {
                    y += th; w += tw; h -= th
                }
            CropOverlayHandle.BOTTOM_LEFT ->
                if (ratio != null) {
                    val c = maxOf(-tw, th)
                    x -= c; w += c; h += c / ratio
                } else {
                    x += tw; w -= tw; h += th
                }
            CropOverlayHandle.BOTTOM_RIGHT ->
                if (ratio != null) {
                    val c = maxOf(tw, th)
                    w += c; h += c / ratio
                } else {
                    w += tw; h += th
                }
            CropOverlayHandle.TOP -> { y += th; h -= th }
            CropOverlayHandle.BOTTOM -> h += th
            CropOverlayHandle.LEFT -> { x += tw; w -= tw }
            CropOverlayHandle.RIGHT -> w += tw
        }
        return if (w >= minSize && h >= minSize) CropRect(x, y, w, h) else rect
    }

    public fun constrained(rect: CropRect, bounds: CropRect, minSize: Float): CropRect {
        val w = maxOf(minSize, minOf(rect.width, bounds.width))
        val h = maxOf(minSize, minOf(rect.height, bounds.height))
        val x = maxOf(bounds.left, minOf(rect.left, bounds.right - w))
        val y = maxOf(bounds.top, minOf(rect.top, bounds.bottom - h))
        return CropRect(x, y, w, h)
    }

    public fun step(bounds: CropRect): CropSize =
        CropSize(bounds.width * AdjustStep.FRACTION.toFloat(), bounds.height * AdjustStep.FRACTION.toFloat())

    public fun outward(handle: CropOverlayHandle, step: CropSize): CropSize = when (handle) {
        CropOverlayHandle.NONE, CropOverlayHandle.CENTER -> CropSize.ZERO
        CropOverlayHandle.TOP_LEFT -> CropSize(-step.width, -step.height)
        CropOverlayHandle.TOP_RIGHT -> CropSize(step.width, -step.height)
        CropOverlayHandle.BOTTOM_LEFT -> CropSize(-step.width, step.height)
        CropOverlayHandle.BOTTOM_RIGHT -> CropSize(step.width, step.height)
        CropOverlayHandle.TOP -> CropSize(0f, -step.height)
        CropOverlayHandle.BOTTOM -> CropSize(0f, step.height)
        CropOverlayHandle.LEFT -> CropSize(-step.width, 0f)
        CropOverlayHandle.RIGHT -> CropSize(step.width, 0f)
    }

    public fun scaledUniformly(
        rect: CropRect,
        step: CropSize,
        aspectRatio: Double?,
        grow: Boolean,
        minSize: Float,
    ): CropRect {
        if (rect.height <= 0f) return rect
        val ratio = aspectRatio?.toFloat() ?: (rect.width / rect.height)
        val width = rect.width + (if (grow) 2f else -2f) * step.width
        val height = width / ratio
        if (width < minSize || height < minSize) return rect
        return CropRect(rect.centerX - width / 2f, rect.centerY - height / 2f, width, height)
    }

    public fun contained(rect: CropRect, bounds: CropRect, keepsRatio: Boolean): CropRect? = when {
        bounds.contains(rect) -> rect
        keepsRatio -> null
        else -> bounds.intersect(rect)
    }

    public fun percentages(rect: CropRect, image: CropRect): CropPercentages {
        if (image.width <= 0f || image.height <= 0f) return CropPercentages(0.0, 0.0, 0.0, 0.0)
        return CropPercentages(
            x = ((rect.left - image.left) / image.width).toDouble(),
            y = ((rect.top - image.top) / image.height).toDouble(),
            width = (rect.width / image.width).toDouble(),
            height = (rect.height / image.height).toDouble(),
        )
    }

    public fun stepped(
        rect: CropRect,
        handle: CropOverlayHandle,
        grow: Boolean,
        aspectRatio: Double?,
        bounds: CropRect,
        minSize: Float,
    ): CropRect? {
        val unit = step(bounds)
        val candidate = if (handle == CropOverlayHandle.CENTER) {
            scaledUniformly(rect, unit, aspectRatio, grow, minSize)
        } else {
            val sign = if (grow) 1f else -1f
            val dir = outward(handle, unit)
            resized(rect, handle, CropSize(dir.width * sign, dir.height * sign), aspectRatio, minSize)
        }
        val keepsRatio = aspectRatio != null || handle == CropOverlayHandle.CENTER
        val fitted = contained(candidate, bounds, keepsRatio) ?: return null
        return if (fitted == rect || fitted.width < minSize || fitted.height < minSize) null else fitted
    }

    public fun moved(rect: CropRect, move: CropFrameMove, bounds: CropRect, minSize: Float): CropRect? {
        val unit = step(bounds)
        val shifted = rect.offsetBy(move.unitX * unit.width, move.unitY * unit.height)
        val fitted = constrained(shifted, bounds, minSize)
        return if (fitted == rect) null else fitted
    }

    /** Poignée saisie au point de départ du geste ; [CropOverlayHandle.NONE] hors du cadre. */
    public fun detectHandle(
        rect: CropRect,
        x: Float,
        y: Float,
        aspectRatio: Double?,
        hitArea: Float,
    ): CropOverlayHandle {
        val t = hitArea / 2f
        fun near(px: Float, py: Float) = kotlin.math.hypot(x - px, y - py) < t
        return when {
            near(rect.left, rect.top) -> CropOverlayHandle.TOP_LEFT
            near(rect.right, rect.top) -> CropOverlayHandle.TOP_RIGHT
            near(rect.left, rect.bottom) -> CropOverlayHandle.BOTTOM_LEFT
            near(rect.right, rect.bottom) -> CropOverlayHandle.BOTTOM_RIGHT
            aspectRatio == null && edge(rect, x, y, t) != CropOverlayHandle.NONE -> edge(rect, x, y, t)
            rect.containsPoint(x, y) -> CropOverlayHandle.CENTER
            else -> CropOverlayHandle.NONE
        }
    }

    private fun edge(rect: CropRect, x: Float, y: Float, t: Float): CropOverlayHandle {
        val inX = x > rect.left && x < rect.right
        val inY = y > rect.top && y < rect.bottom
        return when {
            kotlin.math.abs(y - rect.top) < t && inX -> CropOverlayHandle.TOP
            kotlin.math.abs(y - rect.bottom) < t && inX -> CropOverlayHandle.BOTTOM
            kotlin.math.abs(x - rect.left) < t && inY -> CropOverlayHandle.LEFT
            kotlin.math.abs(x - rect.right) < t && inY -> CropOverlayHandle.RIGHT
            else -> CropOverlayHandle.NONE
        }
    }

    /** Poignées exposées à TalkBack : les bords sont absents en mode ratio. */
    public fun accessibleHandles(aspectRatio: Double?): List<CropOverlayHandle> {
        val corners = listOf(
            CropOverlayHandle.TOP_LEFT, CropOverlayHandle.TOP_RIGHT,
            CropOverlayHandle.BOTTOM_LEFT, CropOverlayHandle.BOTTOM_RIGHT,
        )
        val edges = listOf(CropOverlayHandle.TOP, CropOverlayHandle.BOTTOM, CropOverlayHandle.LEFT, CropOverlayHandle.RIGHT)
        return corners + (if (aspectRatio == null) edges else emptyList()) + CropOverlayHandle.CENTER
    }
}
