package me.meeshy.sdk.model.call

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.min

/** Un palier de la vignette locale : 72, 100 ou 150 dp de large (miroir de iOS `CallSelfTileScale`). */
enum class CallSelfTileScale(val widthDp: Float) {
    X1(72f),
    X2(100f),
    X3(150f),
    ;

    val heightDp: Float get() = widthDp * ASPECT_RATIO

    val larger: CallSelfTileScale get() = entries.getOrElse(ordinal + 1) { this }

    val smaller: CallSelfTileScale get() = entries.getOrElse(ordinal - 1) { this }

    companion object {
        val Standard: CallSelfTileScale = X2
        const val ASPECT_RATIO: Float = 1.4f
        const val STEP_UP_THRESHOLD: Float = 1.12f
        const val STEP_DOWN_THRESHOLD: Float = 0.89f

        /**
         * Le palier où un pincement de [magnification] dépose la vignette : le plus proche
         * (en rapport), sinon — pour un pincement court — le voisin dès qu'il franchit 1,12 ou 0,89.
         */
        fun fromPinch(magnification: Float, current: CallSelfTileScale): CallSelfTileScale {
            if (!magnification.isFinite() || magnification <= 0f) return current
            val target = current.widthDp * magnification
            val nearest = entries.minBy { abs(ln(it.widthDp / target)) }
            if (nearest != current) return nearest
            return when {
                magnification >= STEP_UP_THRESHOLD -> current.larger
                magnification <= STEP_DOWN_THRESHOLD -> current.smaller
                else -> current
            }
        }
    }
}

data class CallTileSize(val widthDp: Float, val heightDp: Float)

data class CallTilePoint(val xDp: Float, val yDp: Float)

/** Les marges de la zone sûre, par côté de lecture (début = gauche en LTR, droite en RTL). */
data class CallSafeInsets(
    val topDp: Float = 0f,
    val bottomDp: Float = 0f,
    val startDp: Float = 0f,
    val endDp: Float = 0f,
)

enum class CallSelfTileCorner { TopStart, TopEnd, BottomStart, BottomEnd }

/**
 * La loi de la vignette locale : sa taille (palier + pincement en cours, bornée à la zone sûre),
 * le centre de chaque coin, et le coin le plus proche où un glissé s'accroche. Pure : les
 * coordonnées vont du début de lecture vers la fin (le rendu les miroite en RTL).
 */
object CallSelfTileLaw {
    const val MARGIN_DP: Float = 16f
    const val TOP_CLEARANCE_DP: Float = 60f
    const val BOTTOM_CLEARANCE_DP: Float = 130f

    /** La taille suivie des doigts pendant le pincement, entre le plus petit et le plus grand palier. */
    fun liveSize(pinch: Float, from: CallSelfTileScale): CallTileSize {
        if (!pinch.isFinite() || pinch <= 0f) return CallTileSize(from.widthDp, from.heightDp)
        val width = (from.widthDp * pinch).coerceIn(CallSelfTileScale.X1.widthDp, CallSelfTileScale.X3.widthDp)
        return CallTileSize(width, width * CallSelfTileScale.ASPECT_RATIO)
    }

    /** Réduit [size] (jamais ne l'agrandit) pour tenir dans [available], à rapport constant. */
    fun fitted(size: CallTileSize, available: CallTileSize): CallTileSize {
        if (size.widthDp <= 0f || size.heightDp <= 0f || available.widthDp <= 0f || available.heightDp <= 0f) return size
        val ratio = min(1f, min(available.widthDp / size.widthDp, available.heightDp / size.heightDp))
        return CallTileSize(size.widthDp * ratio, size.heightDp * ratio)
    }

    /** La taille affichée : le palier, suivi du pincement, borné à la zone sûre de l'écran. */
    fun tileSize(container: CallTileSize, insets: CallSafeInsets, scale: CallSelfTileScale, pinch: Float): CallTileSize {
        val available = CallTileSize(
            widthDp = container.widthDp - insets.startDp - insets.endDp - 2 * MARGIN_DP,
            heightDp = container.heightDp - insets.topDp - insets.bottomDp - TOP_CLEARANCE_DP - BOTTOM_CLEARANCE_DP,
        )
        return fitted(liveSize(pinch, scale), available)
    }

    /** Le centre de repos de la vignette dans [corner], marges de zone sûre et dégagements du chrome compris. */
    fun center(
        corner: CallSelfTileCorner,
        container: CallTileSize,
        size: CallTileSize,
        insets: CallSafeInsets,
    ): CallTilePoint {
        val halfW = size.widthDp / 2
        val halfH = size.heightDp / 2
        val startX = insets.startDp + MARGIN_DP + halfW
        val endX = container.widthDp - insets.endDp - MARGIN_DP - halfW
        val topY = insets.topDp + TOP_CLEARANCE_DP + halfH
        val bottomY = container.heightDp - insets.bottomDp - BOTTOM_CLEARANCE_DP - halfH
        return when (corner) {
            CallSelfTileCorner.TopStart -> CallTilePoint(startX, topY)
            CallSelfTileCorner.TopEnd -> CallTilePoint(endX, topY)
            CallSelfTileCorner.BottomStart -> CallTilePoint(startX, bottomY)
            CallSelfTileCorner.BottomEnd -> CallTilePoint(endX, bottomY)
        }
    }

    /** Le coin dont le centre de repos est le plus proche de [point] (égalité : l'ordre de déclaration). */
    fun nearestCorner(
        point: CallTilePoint,
        container: CallTileSize,
        size: CallTileSize,
        insets: CallSafeInsets,
    ): CallSelfTileCorner = CallSelfTileCorner.entries.minBy { corner ->
        val c = center(corner, container, size, insets)
        hypot(point.xDp - c.xDp, point.yDp - c.yDp)
    }

    /** Le coin de repos initial : en haut à la fin, comme sur iOS. */
    val InitialCorner: CallSelfTileCorner = CallSelfTileCorner.TopEnd
}
