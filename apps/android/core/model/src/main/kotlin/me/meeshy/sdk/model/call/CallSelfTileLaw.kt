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

    /** L1.5 — la largeur du palier dans une fenêtre couchée (130 dp au palier standard). */
    fun widthDp(isLandscape: Boolean): Float = if (isLandscape) widthDp * LANDSCAPE_WIDTH_FACTOR else widthDp

    /** L1.5 — dans une fenêtre plus large que haute, ma vignette se couche : 130 × 96 au palier standard. */
    fun size(isLandscape: Boolean): CallTileSize =
        if (isLandscape) {
            CallTileSize(widthDp(isLandscape = true), widthDp(isLandscape = true) * LANDSCAPE_ASPECT_RATIO)
        } else {
            CallTileSize(widthDp, heightDp)
        }

    val larger: CallSelfTileScale get() = entries.getOrElse(ordinal + 1) { this }

    val smaller: CallSelfTileScale get() = entries.getOrElse(ordinal - 1) { this }

    companion object {
        val Standard: CallSelfTileScale = X2
        const val ASPECT_RATIO: Float = 1.4f
        const val LANDSCAPE_WIDTH_FACTOR: Float = 1.3f
        const val LANDSCAPE_ASPECT_RATIO: Float = 96f / 130f
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
    /** P16.8 — la place que prend, sous l'en-tête, le bandeau « Vous partagez » : ma vignette se range dessous. */
    val bannerDp: Float = 0f,
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

    /** La forme de la fenêtre décide, jamais l'appareil : plus large que haute = paysage (tablettes, fenêtres libres). */
    fun isLandscape(window: CallTileSize): Boolean = window.widthDp > window.heightDp

    /** La taille suivie des doigts pendant le pincement, entre le plus petit et le plus grand palier. */
    fun liveSize(pinch: Float, from: CallSelfTileScale, isLandscape: Boolean = false): CallTileSize {
        if (!pinch.isFinite() || pinch <= 0f) return from.size(isLandscape)
        val width = (from.widthDp(isLandscape) * pinch)
            .coerceIn(CallSelfTileScale.X1.widthDp(isLandscape), CallSelfTileScale.X3.widthDp(isLandscape))
        val ratio = if (isLandscape) CallSelfTileScale.LANDSCAPE_ASPECT_RATIO else CallSelfTileScale.ASPECT_RATIO
        return CallTileSize(width, width * ratio)
    }

    /**
     * L1.5 — le point de départ d'une rotation : la taille d'avant, en rapport de la nouvelle (x = largeur, y = hauteur).
     * Mise à l'échelle depuis ce rapport vers 1, la vignette se couche ou se relève sans saut.
     */
    fun rotationStart(previous: CallTileSize, target: CallTileSize): CallTilePoint =
        if (target.widthDp <= 0f || target.heightDp <= 0f) {
            CallTilePoint(1f, 1f)
        } else {
            CallTilePoint(previous.widthDp / target.widthDp, previous.heightDp / target.heightDp)
        }

    /** L1.5 — l'échelle d'un axe pendant la rotation : de [start] vers 1 à mesure que [fraction] va de 0 à 1. */
    fun rotationScale(start: Float, fraction: Float): Float = start + (1f - start) * fraction

    /** L1.5 — la taille que la vignette MONTRE à [fraction] d'une rotation : c'est d'elle que repart la rotation suivante. */
    fun shownDuringRotation(layout: CallTileSize, start: CallTilePoint, fraction: Float): CallTileSize = CallTileSize(
        layout.widthDp * rotationScale(start.xDp, fraction),
        layout.heightDp * rotationScale(start.yDp, fraction),
    )

    /** Réduit [size] (jamais ne l'agrandit) pour tenir dans [available], à rapport constant. */
    fun fitted(size: CallTileSize, available: CallTileSize): CallTileSize {
        if (size.widthDp <= 0f || size.heightDp <= 0f || available.widthDp <= 0f || available.heightDp <= 0f) return size
        val ratio = min(1f, min(available.widthDp / size.widthDp, available.heightDp / size.heightDp))
        return CallTileSize(size.widthDp * ratio, size.heightDp * ratio)
    }

    /** #16663 — un toucher range les contrôles : la vignette passe à son plus petit palier, puis reprend le palier choisi. */
    fun resting(chosen: CallSelfTileScale, controlsVisible: Boolean): CallSelfTileScale =
        if (controlsVisible) chosen else CallSelfTileScale.X1

    /**
     * G1.11 — le rangement est une TRANSFORMATION : le cadre reste celui du palier choisi et la vignette est mise à
     * l'échelle de sa petite taille, jamais relayoutée.
     */
    fun restingFactor(chosen: CallSelfTileScale, controlsVisible: Boolean): Float =
        resting(chosen, controlsVisible).widthDp / chosen.widthDp

    /**
     * Ce qui ne doit pas rapetisser avec la vignette rangée (liseré, coins) : divisé par le facteur d'échelle, il est
     * dessiné à sa taille de petite vignette (lois 4 et 11).
     */
    fun counterScaled(length: Float, by: Float): Float = if (by.isFinite() && by > 0f) length / by else length

    /** L'ancre du rangement : le coin de la vignette tourné vers son coin d'écran, qui garde ainsi sa marge. */
    fun anchor(corner: CallSelfTileCorner): CallTilePoint = when (corner) {
        CallSelfTileCorner.TopStart -> CallTilePoint(0f, 0f)
        CallSelfTileCorner.TopEnd -> CallTilePoint(1f, 0f)
        CallSelfTileCorner.BottomStart -> CallTilePoint(0f, 1f)
        CallSelfTileCorner.BottomEnd -> CallTilePoint(1f, 1f)
    }

    /** La taille affichée : le palier, suivi du pincement, borné à la zone sûre de l'écran. */
    fun tileSize(container: CallTileSize, insets: CallSafeInsets, scale: CallSelfTileScale, pinch: Float): CallTileSize {
        val available = CallTileSize(
            widthDp = container.widthDp - insets.startDp - insets.endDp - 2 * MARGIN_DP,
            heightDp = container.heightDp - insets.topDp - insets.bottomDp - insets.bannerDp - TOP_CLEARANCE_DP - BOTTOM_CLEARANCE_DP,
        )
        return fitted(liveSize(pinch, scale, isLandscape(container)), available)
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
        val topY = insets.topDp + insets.bannerDp + TOP_CLEARANCE_DP + halfH
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
