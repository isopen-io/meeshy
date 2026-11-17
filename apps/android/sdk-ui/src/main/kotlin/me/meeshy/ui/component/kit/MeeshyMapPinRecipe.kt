package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/** La précision d'une position, déjà mesurée en dp d'écran : l'épingle ne convertit jamais des mètres. */
public sealed interface MeeshyMapPinPrecision {
    public data object Exact : MeeshyMapPinPrecision

    /** Un quartier : un disque de flou de [radiusDp]. */
    public data class Area(val radiusDp: Float) : MeeshyMapPinPrecision

    /** Une ville : même dessin que le quartier, seul le rayon change. */
    public data class Wide(val radiusDp: Float) : MeeshyMapPinPrecision
}

/** `Own` est la mienne (un repère, jamais une personne) ; `Ghost` une épingle sans personne. */
public enum class MeeshyMapPinKind { Other, Own, Ghost }

@Immutable
public data class MeeshyMapPinValues(
    val kind: MeeshyMapPinKind,
    val contentDp: Float,
    val linerDp: Float,
    val tapTargetDp: Float,
    val drawsPoint: Boolean,
    val drawsDisc: Boolean,
    val discDiameterDp: Float,
    val discOpacity: Float,
    val discDashed: Boolean,
    val drawsPulse: Boolean,
    val pulseAnimates: Boolean,
    val pressScale: Float,
    val contentOpacity: Float,
    val drawsRing: Boolean,
    val isForeground: Boolean,
)

/**
 * K36 · la loi et la recette de l'épingle de personne. La précision change ce qu'il y a AUTOUR de l'épingle, jamais
 * l'épingle elle-même. Jumeau iOS : `MeeshyMapPin`.
 */
public object MeeshyMapPinRecipe {
    public const val CONTENT_DP: Float = 48f
    public const val SELECTED_DP: Float = 56f
    public const val OWN_DP: Float = 38f
    public const val CLUSTER_DP: Float = 36f
    public const val CLUSTER_OVERLAP_DP: Float = 8f
    public const val CLUSTER_MAX: Int = 3
    public const val CLUSTER_COUNT_DP: Float = 26f
    public const val LINER_DP: Float = 3f
    public const val OWN_LINER_DP: Float = 2.5f
    public const val PULSE_RING_DP: Float = 2f
    public const val PULSE_OFFSET_DP: Float = 6f
    public const val TAP_TARGET_DP: Float = 44f
    public const val MIN_BLUR_RADIUS_DP: Float = 32f
    public const val BLUR_OPACITY: Float = 0.18f
    public const val BLUR_OPACITY_SELECTED: Float = 0.28f
    public const val PRESS_SCALE: Float = 0.94f
    public const val STALE_OPACITY: Float = 0.55f
    public const val CAPTION_MAX: Int = 18
    public const val CAPTION_HEIGHT_DP: Float = 22f
    public const val CAPTION_GAP_DP: Float = 12f
    public const val POINT_DP: Float = 14f
    public const val BADGE_DP: Float = 14f
    public const val CLUSTER_MIN: Int = 2
    public const val CLUSTER_CAP: Int = 99
    public const val PULSE_MILLIS: Int = 2400

    /** Le rayon de précision en dp ; `Exact`, négatif ou illisible n'en ont pas. */
    public fun radius(precision: MeeshyMapPinPrecision): Float {
        val radius = when (precision) {
            MeeshyMapPinPrecision.Exact -> 0f
            is MeeshyMapPinPrecision.Area -> precision.radiusDp
            is MeeshyMapPinPrecision.Wide -> precision.radiusDp
        }
        return if (radius.isFinite() && radius > 0f) radius else 0f
    }

    @Suppress("LongParameterList")
    public fun resolve(
        kind: MeeshyMapPinKind = MeeshyMapPinKind.Other,
        precision: MeeshyMapPinPrecision = MeeshyMapPinPrecision.Exact,
        isLive: Boolean = false,
        isSelected: Boolean = false,
        isStale: Boolean = false,
        isPressed: Boolean = false,
        reduceMotion: Boolean = false,
    ): MeeshyMapPinValues {
        val isOther = kind == MeeshyMapPinKind.Other
        val radius = if (isOther) radius(precision) else 0f
        val drawsDisc = radius >= MIN_BLUR_RADIUS_DP
        val selected = isOther && isSelected
        val stale = isOther && isStale
        val wantsPulse = kind == MeeshyMapPinKind.Own || (isOther && isLive && !stale)
        return MeeshyMapPinValues(
            kind = kind,
            contentDp = when {
                kind == MeeshyMapPinKind.Own -> OWN_DP
                selected -> SELECTED_DP
                else -> CONTENT_DP
            },
            linerDp = if (kind == MeeshyMapPinKind.Own) OWN_LINER_DP else LINER_DP,
            tapTargetDp = TAP_TARGET_DP,
            drawsPoint = isOther && precision == MeeshyMapPinPrecision.Exact,
            drawsDisc = drawsDisc,
            discDiameterDp = if (drawsDisc) radius * 2f else 0f,
            discOpacity = if (selected) BLUR_OPACITY_SELECTED else BLUR_OPACITY,
            discDashed = stale,
            drawsPulse = wantsPulse,
            pulseAnimates = wantsPulse && !reduceMotion,
            pressScale = if (isPressed) PRESS_SCALE else 1f,
            contentOpacity = if (stale) STALE_OPACITY else 1f,
            drawsRing = selected,
            isForeground = selected,
        )
    }

    /** Un mot sous l'épingle : une ligne, coupé à 18 signes. */
    public fun caption(caption: String?): String? {
        if (caption.isNullOrEmpty()) return null
        val points = caption.codePointCount(0, caption.length)
        if (points <= CAPTION_MAX) return caption
        val end = caption.offsetByCodePoints(0, CAPTION_MAX - 1)
        return caption.substring(0, end) + "…"
    }

    /** Le compte d'une grappe : rien sous deux, « 99+ » au-delà de 99. */
    public fun clusterCount(count: Int): String? = when {
        count < CLUSTER_MIN -> null
        count > CLUSTER_CAP -> "$CLUSTER_CAP+"
        else -> count.toString()
    }
}
