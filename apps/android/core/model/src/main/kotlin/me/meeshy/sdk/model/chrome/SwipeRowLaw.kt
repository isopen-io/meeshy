package me.meeshy.sdk.model.chrome

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Cadre d'une rangee dans la fenetre, en pixels : sert a decider si un toucher tombe hors de la ligne ouverte. */
public data class SwipeRowFrame(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    public fun contains(x: Float, y: Float): Boolean = x >= left && x < right && y >= top && y < bottom
}

/**
 * Loi des rangees glissantes (iOS `SwipeableRow` + `SwipeRowRules`), en dp. Convention : un decalage
 * POSITIF revele les actions de debut de ligne (leading), un decalage NEGATIF celles de fin (trailing),
 * dans le sens de lecture — l'ecran applique l'inversion RTL.
 */
public object SwipeRowLaw {
    public const val MAX_ACTIONS_PER_SIDE: Int = 3
    public const val ACTION_WIDTH_DP: Float = 76f
    public const val RUBBER_FACTOR: Float = 0.18f
    public const val SNAP_THRESHOLD: Float = 0.35f
    public const val SNAP_VELOCITY: Float = 450f
    public const val MINIMUM_DISTANCE_DP: Float = 22f
    public const val CELL_MIN_SCALE: Float = 0.4f

    private const val OPEN_MIN_TRANSLATION = 20f
    private const val CLOSE_MIN_TRANSLATION = 10f

    public fun <T> capped(actions: List<T>): List<T> = actions.take(MAX_ACTIONS_PER_SIDE)

    /** Decalage visuel avec rubber-banding au-dela de la zone d'action. */
    public fun effectiveOffset(openOffset: Float, drag: Float, leadingWidth: Float, trailingWidth: Float): Float {
        val raw = openOffset + drag
        if (raw > 0f) {
            if (leadingWidth <= 0f) return drag * RUBBER_FACTOR
            if (raw > leadingWidth) return leadingWidth + (raw - leadingWidth) * RUBBER_FACTOR
        } else if (raw < 0f) {
            if (trailingWidth <= 0f) return drag * RUBBER_FACTOR
            val magnitude = -raw
            if (magnitude > trailingWidth) return -(trailingWidth + (magnitude - trailingWidth) * RUBBER_FACTOR)
        }
        return raw
    }

    /** Position d'arret au relacher : `0` ferme, `leadingWidth` ou `-trailingWidth` ouvert. */
    public fun resolveRelease(
        openOffset: Float,
        translation: Float,
        velocity: Float,
        leadingWidth: Float,
        trailingWidth: Float,
    ): Float = when {
        openOffset == 0f -> when {
            leadingWidth > 0f && (translation > leadingWidth * SNAP_THRESHOLD ||
                (translation > OPEN_MIN_TRANSLATION && velocity > SNAP_VELOCITY)) -> leadingWidth
            trailingWidth > 0f && (translation < -trailingWidth * SNAP_THRESHOLD ||
                (translation < -OPEN_MIN_TRANSLATION && velocity < -SNAP_VELOCITY)) -> -trailingWidth
            else -> 0f
        }
        openOffset > 0f ->
            if (translation < -leadingWidth * SNAP_THRESHOLD ||
                (translation < -CLOSE_MIN_TRANSLATION && velocity < -SNAP_VELOCITY)
            ) 0f else openOffset
        else ->
            if (translation > trailingWidth * SNAP_THRESHOLD ||
                (translation > CLOSE_MIN_TRANSLATION && velocity > SNAP_VELOCITY)
            ) 0f else openOffset
    }

    /** Progression 0..1 de la cellule de rang [index] (0 = la plus proche du bord) pour une revelation donnee. */
    public fun cellProgress(reveal: Float, index: Int): Float =
        min(max(0f, reveal - index * ACTION_WIDTH_DP) / ACTION_WIDTH_DP, 1f)

    public fun cellScale(progress: Float): Float = CELL_MIN_SCALE + (1f - CELL_MIN_SCALE) * progress

    public fun cellOpacity(progress: Float): Float = min(progress * 2.5f, 1f)

    /** Progression globale 0..1 exposee au contenu de la rangee. */
    public fun swipeProgress(effectiveOffset: Float, leadingWidth: Float, trailingWidth: Float): Float =
        min(abs(effectiveOffset) / max(max(leadingWidth, trailingWidth), 1f), 1f)

    /** Un toucher referme la ligne ouverte des qu'il tombe hors d'elle ; un cadre non mesure referme. */
    public fun closesOpenRow(x: Float, y: Float, openRowFrame: SwipeRowFrame?): Boolean =
        openRowFrame == null || !openRowFrame.contains(x, y)
}
