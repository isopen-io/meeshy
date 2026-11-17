package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshyKitInkColors

/** Les trois présentations : verre qui s'incline, claire à plat (image, impression), cadre de visée posé sur l'image de l'hôte. */
public enum class MeeshyCodeCardStyle { Glass, Plain, Reticle }

/** Les trois côtés du code : 72, 160 et 220. Pas de côté libre. */
public enum class MeeshyCodeCardSize(public val side: Double) { Mini(72.0), Compact(160.0), Large(220.0) }

/** D'où vient l'inclinaison : le capteur, le pointeur, ou rien (carte droite). */
public enum class MeeshyCodeCardTilt { Device, Pointer, None }

/** Ce que l'angle donne : le pivot borné, la place du reflet et les deux glissements. */
@Immutable
public data class MeeshyCodeCardMotion(
    val yaw: Double,
    val pitch: Double,
    val reflectionPosition: Double,
    val plateShift: Double,
    val centerShift: Double,
) {
    public companion object {
        public val Flat: MeeshyCodeCardMotion = MeeshyCodeCardMotion(0.0, 0.0, MeeshyCodeCardRecipe.REFLECTION_REST, 0.0, 0.0)
    }
}

@Immutable
public data class MeeshyCodeCardValues(
    val style: MeeshyCodeCardStyle,
    val size: MeeshyCodeCardSize,
    val side: Double,
    val plateMargin: Double,
    val plateRadius: Double,
    val cardWidth: Double,
    val tilt: MeeshyCodeCardTilt,
    val isGlass: Boolean,
    val hasReflection: Boolean,
    val hasCenter: Boolean,
    val hasCaption: Boolean,
    val showsSkeleton: Boolean,
)

/**
 * **La recette de K31 en valeurs** : les côtés, les marges, les rayons, la largeur de la carte, la pastille et la légende,
 * l'inclinaison bornée (fonction pure de l'angle) et la teinte servie à 4,5:1 sur la plaque. La plaque et l'encre des modules
 * ne dépendent pas du thème. Jumeau iOS : `MeeshyCodeCardRecipe`.
 */
public object MeeshyCodeCardRecipe {
    public const val YAW_LIMIT: Double = 16.0
    public const val PITCH_LIMIT: Double = 6.0
    public const val PLATE_SHIFT_REACH: Double = 7.0
    public const val CENTER_SHIFT_REACH: Double = 13.0
    public const val REFLECTION_REST: Double = 40.0
    public const val REFLECTION_SWEEP: Double = 72.0
    public const val CARD_CHROME: Double = 98.0
    public const val CARD_RADIUS: Double = 34.0
    public const val QUIET_MODULES: Int = 4
    public const val MODULE_SHARE: Double = 0.86
    public const val MODULE_CORNER_SHARE: Double = 0.36
    public const val EYE_MODULES: Int = 7
    public const val CENTER_SHARE: Double = 0.25
    public const val CENTER_MINIMUM_SIDE: Double = 120.0
    public const val TINT_CONTRAST: Double = 4.5

    public fun resolve(
        style: MeeshyCodeCardStyle,
        size: MeeshyCodeCardSize,
        tilt: MeeshyCodeCardTilt = MeeshyCodeCardTilt.Device,
        isReady: Boolean = true,
        reduceMotion: Boolean = false,
    ): MeeshyCodeCardValues {
        val isGlass = style == MeeshyCodeCardStyle.Glass && size != MeeshyCodeCardSize.Mini
        val resolvedTilt = if (!isGlass || reduceMotion) MeeshyCodeCardTilt.None else tilt
        val margin = plateMargin(size)
        return MeeshyCodeCardValues(
            style = style,
            size = size,
            side = size.side,
            plateMargin = margin,
            plateRadius = plateRadius(size),
            cardWidth = if (size == MeeshyCodeCardSize.Mini) size.side + margin * 2 else size.side + CARD_CHROME,
            tilt = resolvedTilt,
            isGlass = isGlass,
            hasReflection = isGlass && resolvedTilt != MeeshyCodeCardTilt.None,
            hasCenter = size != MeeshyCodeCardSize.Mini && size.side >= CENTER_MINIMUM_SIDE,
            hasCaption = size != MeeshyCodeCardSize.Mini,
            showsSkeleton = !isReady,
        )
    }

    /** L'inclinaison : pivot borné à ±16° en lacet et ±6° en tangage ; le reflet balaie de 112 % à −32 % de la carte. */
    public fun motion(yaw: Double, pitch: Double): MeeshyCodeCardMotion {
        val boundedYaw = bounded(yaw, YAW_LIMIT)
        val share = boundedYaw / YAW_LIMIT
        return MeeshyCodeCardMotion(
            yaw = boundedYaw,
            pitch = bounded(pitch, PITCH_LIMIT),
            reflectionPosition = REFLECTION_REST - share * REFLECTION_SWEEP,
            plateShift = -share * PLATE_SHIFT_REACH,
            centerShift = -share * CENTER_SHIFT_REACH,
        )
    }

    /** Le côté de la pastille : 25 % du code, absente sous 120. */
    public fun centerSide(side: Double): Double = if (side < CENTER_MINIMUM_SIDE) 0.0 else Math.round(side * CENTER_SHARE).toDouble()

    public fun plateColor(style: MeeshyCodeCardStyle): Color = if (style == MeeshyCodeCardStyle.Plain) Color.White else MeeshyKitInkColors.GlassPlate

    public fun inkColor(style: MeeshyCodeCardStyle): Color = if (style == MeeshyCodeCardStyle.Plain) Color.Black else MeeshyKitInkColors.GlassInk

    /** La teinte servie : assombrie au besoin jusqu'à 4,5:1 sur la plaque. */
    public fun servedTint(tint: Color, style: MeeshyCodeCardStyle): Color =
        MeeshyKitColor.darkened(tint, TINT_CONTRAST, plateColor(style))

    public fun plateMargin(size: MeeshyCodeCardSize): Double = when (size) {
        MeeshyCodeCardSize.Mini -> 6.0
        MeeshyCodeCardSize.Compact -> 12.0
        MeeshyCodeCardSize.Large -> 16.0
    }

    public fun plateRadius(size: MeeshyCodeCardSize): Double = when (size) {
        MeeshyCodeCardSize.Mini -> 14.0
        MeeshyCodeCardSize.Compact -> 22.0
        MeeshyCodeCardSize.Large -> 28.0
    }

    private fun bounded(value: Double, limit: Double): Double = if (value.isFinite()) value.coerceIn(-limit, limit) else 0.0
}
