package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.max

public enum class MeeshyMedallionKind { Accent, Ok, Warn, Err, Neutral }

/** Disque, carré arrondi (rayon à 34 % du côté), festonnée à neuf lobes, organique. */
public enum class MeeshyMedallionShape { Disc, Squircle, Scallop, Blob }

public enum class MeeshyMedallionFill { Soft, Solid }

/** Au plus un décor : halo, anneau pointillé, trait barré, ou de une à trois ondes. */
public sealed interface MeeshyMedallionDecor {
    public data object None : MeeshyMedallionDecor

    public data object Halo : MeeshyMedallionDecor

    public data object Dashed : MeeshyMedallionDecor

    public data object Struck : MeeshyMedallionDecor

    public data class Waves(val count: Int) : MeeshyMedallionDecor
}

/** Six diamètres. */
public enum class MeeshyMedallionSize(public val diameterDp: Int) { S24(24), S36(36), S44(44), S52(52), S64(64), S96(96) }

public enum class MeeshyMedallionState { Normal, Current, Earned, Locked }

/** La peinture d'un médaillon : fond doux, aplat, ou le contour du verrouillé. */
public enum class MeeshyMedallionPaint { Soft, Solid, Outline }

@Immutable
public data class MeeshyMedallionValues(
    val diameterDp: Int,
    val shape: MeeshyMedallionShape,
    val paint: MeeshyMedallionPaint,
    val decor: MeeshyMedallionDecor,
    val softAlpha: Float,
    val hasDarkInk: Boolean,
    val hasBorder: Boolean,
    val hasShadow: Boolean,
    val glyphDp: Float,
    val valueDp: Float,
    val showsLock: Boolean,
    val haloFraction: Float,
    val haloAlpha: Float,
    val layoutCountsDecor: Boolean,
    val dashedInsetFraction: Float,
    val dashedStrokeDp: Float,
    val borderDp: Float,
    val borderIsDashed: Boolean,
    val struckStrokeDp: Float,
    val struckLengthFraction: Float,
    val struckAngleDegrees: Float,
    val cutoutDp: Float,
    val waveCount: Int,
    val isAnimated: Boolean,
    val drifts: Boolean,
    val hitDp: Int?,
    val isButton: Boolean,
)

public object MeeshyMedallionRecipe {
    public const val SQUIRCLE_RADIUS_FRACTION: Float = 0.34f
    public const val SCALLOP_LOBES: Int = 9
    public const val DASHED_INSET_WITH_HALO: Float = 0.20f
    public const val DASHED_TURN_MILLIS: Int = 40_000
    public const val earnFromScale: Float = 0.6f
    public const val earnPeakScale: Float = 1.14f
    private const val SOFT_ALPHA: Float = 0.18f
    private const val HALO_FRACTION: Float = 0.11f
    private const val HALO_ALPHA: Float = 0.07f
    private const val DASHED_INSET: Float = 0.11f
    private const val GLYPH_FRACTION: Float = 0.5f
    private const val GLYPH_MIN_DP: Float = 14f
    private const val VALUE_FRACTION: Float = 0.44f
    private const val STRUCK_STROKE_DP: Float = 3f
    private const val DASHED_STROKE_DP: Float = 2f
    private const val LOCKED_BORDER_DP: Float = 1.5f
    private const val STRUCK_LENGTH: Float = 0.64f
    private const val STRUCK_ANGLE: Float = -45f
    private const val MAX_WAVES: Int = 3

    @Suppress("LongParameterList")
    public fun resolve(
        shape: MeeshyMedallionShape,
        fill: MeeshyMedallionFill,
        decor: MeeshyMedallionDecor,
        size: MeeshyMedallionSize,
        state: MeeshyMedallionState,
        hasValue: Boolean,
        reduceMotion: Boolean,
        supportsShape: Boolean,
    ): MeeshyMedallionValues {
        val locked = state == MeeshyMedallionState.Locked
        val paint = when {
            locked -> MeeshyMedallionPaint.Outline
            state == MeeshyMedallionState.Current || fill == MeeshyMedallionFill.Solid -> MeeshyMedallionPaint.Solid
            else -> MeeshyMedallionPaint.Soft
        }
        val effectiveShape = if (supportsShape || shape == MeeshyMedallionShape.Disc) shape else MeeshyMedallionShape.Disc
        val effectiveDecor = if (locked) MeeshyMedallionDecor.None else decor
        val diameter = size.diameterDp
        return MeeshyMedallionValues(
            diameterDp = diameter,
            shape = effectiveShape,
            paint = paint,
            decor = effectiveDecor,
            softAlpha = SOFT_ALPHA,
            hasDarkInk = paint == MeeshyMedallionPaint.Solid,
            hasBorder = locked,
            hasShadow = false,
            glyphDp = max(GLYPH_MIN_DP, diameter * GLYPH_FRACTION),
            valueDp = diameter * VALUE_FRACTION,
            showsLock = locked,
            haloFraction = HALO_FRACTION,
            haloAlpha = HALO_ALPHA,
            layoutCountsDecor = false,
            dashedInsetFraction = if (effectiveDecor == MeeshyMedallionDecor.Halo) DASHED_INSET_WITH_HALO else DASHED_INSET,
            dashedStrokeDp = DASHED_STROKE_DP,
            borderDp = if (locked) LOCKED_BORDER_DP else 0f,
            borderIsDashed = locked,
            struckStrokeDp = STRUCK_STROKE_DP,
            struckLengthFraction = STRUCK_LENGTH,
            struckAngleDegrees = STRUCK_ANGLE,
            cutoutDp = STRUCK_STROKE_DP,
            waveCount = waveCount(effectiveDecor, reduceMotion),
            isAnimated = !reduceMotion,
            drifts = !reduceMotion && effectiveShape == MeeshyMedallionShape.Blob,
            hitDp = null,
            isButton = false,
        )
    }

    /** Sans nom, le médaillon est caché à la voix ; avec un nom, c'est une image nommée. */
    public fun isHiddenFromVoice(label: String?): Boolean = label.isNullOrEmpty()

    private fun waveCount(decor: MeeshyMedallionDecor, reduceMotion: Boolean): Int {
        val waves = decor as? MeeshyMedallionDecor.Waves ?: return 0
        return if (reduceMotion) 1 else waves.count.coerceIn(1, MAX_WAVES)
    }
}
