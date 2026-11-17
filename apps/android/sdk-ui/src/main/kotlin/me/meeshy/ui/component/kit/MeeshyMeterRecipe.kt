package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import kotlin.math.floor
import kotlin.math.roundToInt

/** La forme de la jauge : une piste continue, N crans pour un petit quota, ou la barre sans valeur (K42). */
public sealed interface MeeshyMeterForm {
    public data object Continuous : MeeshyMeterForm

    public data class Stepped(val count: Int) : MeeshyMeterForm

    public data object Indeterminate : MeeshyMeterForm
}

/** Un sens ; `tint` passe une teinte libre, opaque. */
public enum class MeeshyMeterKind { Accent, Ok, Warn, Err }

/** Trois pistes : 5 en barre dense, 8 par défaut, 12 quand elle est le sujet. */
public enum class MeeshyMeterSize(public val trackDp: Int) { S5(5), S8(8), S12(12) }

/** La loi de la fraction : valeur brute et total, rendus bornés à 0…1. Un total nul ou négatif ne rend rien. */
public object MeeshyMeterFraction {
    public fun isRendered(total: Double): Boolean = total > 0.0

    public fun resolve(value: Double, total: Double): Float {
        if (!isRendered(total) || value.isNaN()) return 0f
        return (value / total).toFloat().coerceIn(0f, 1f)
    }
}

@Immutable
public data class MeeshyMeterValues(
    val kind: MeeshyMeterKind,
    val trackDp: Int,
    val fraction: Float,
    val minFillDp: Int,
    val opacity: Float,
    val isDesaturated: Boolean,
    val saturation: Float,
    val segmentCount: Int,
    val segmentGapDp: Int,
    val filledSegments: Int,
    val markOffsets: List<Float>,
    val fillsFromEnd: Boolean,
    val isIndeterminate: Boolean,
)

public object MeeshyMeterRecipe {
    public const val PASS_MILLIS: Int = 1800
    public const val STALE_OPACITY: Float = 0.62f
    public const val DISABLED_OPACITY: Float = 0.45f
    public const val ROW_DELAY_MILLIS: Int = 100
    private const val STEP_GAP_DP: Int = 6
    private const val STEP_TRACK_DP: Int = 12

    @Suppress("LongParameterList")
    public fun resolve(
        form: MeeshyMeterForm,
        kind: MeeshyMeterKind,
        fullKind: MeeshyMeterKind?,
        size: MeeshyMeterSize,
        fraction: Float,
        isStale: Boolean,
        isEnabled: Boolean,
        isRtl: Boolean,
        marks: List<Float>,
    ): MeeshyMeterValues {
        val bounded = fraction.coerceIn(0f, 1f)
        val stepped = form as? MeeshyMeterForm.Stepped
        val track = if (stepped != null) STEP_TRACK_DP else size.trackDp
        val count = stepped?.count?.coerceAtLeast(1) ?: 0
        return MeeshyMeterValues(
            kind = if (bounded >= 1f && fullKind != null) fullKind else kind,
            trackDp = track,
            fraction = bounded,
            minFillDp = if (bounded > 0f) track else 0,
            opacity = when {
                !isEnabled -> DISABLED_OPACITY
                isStale -> STALE_OPACITY
                else -> 1f
            },
            isDesaturated = isStale,
            saturation = if (isStale) 0f else 1f,
            segmentCount = count,
            segmentGapDp = if (stepped != null) STEP_GAP_DP else 0,
            filledSegments = if (stepped != null) floor(bounded * count + FILL_EPSILON).toInt().coerceIn(0, count) else 0,
            markOffsets = if (stepped != null) emptyList() else marks.map { it.coerceIn(0f, 1f) }.sorted().map { if (isRtl) 1f - it else it },
            fillsFromEnd = isRtl,
            isIndeterminate = form == MeeshyMeterForm.Indeterminate,
        )
    }

    /**
     * Le bord gauche du passage de la barre sans valeur, pour un avancement [pass] de 0 à 1 : il entre par le bord de début et
     * sort par le bord de fin, donc de droite à gauche en arabe.
     */
    public fun passStart(pass: Float, width: Float, segment: Float, isRtl: Boolean): Float {
        val travelled = (width + segment) * pass
        return if (isRtl) width - travelled else travelled - segment
    }

    /** L'entrée ne se joue que si la jauge n'a jamais été vue avec cette valeur ; jamais en mouvement réduit. */
    public fun entersAnimated(seenValue: Float?, value: Float, reduceMotion: Boolean): Boolean =
        !reduceMotion && seenValue != value

    /** Décalage de la cascade d'une liste de jauges : 100 ms par rangée. */
    public fun entryDelayMillis(index: Int): Int = index.coerceAtLeast(0) * ROW_DELAY_MILLIS

    /** La voix dit la valeur vraie (« 23 sur 50 ») ; à défaut, le pourcentage, écrit par [percent]. */
    public fun spokenValue(
        spoken: String?,
        fraction: Float,
        percent: (Float) -> String = { "${(it * 100).roundToInt()}%" },
    ): String = spoken ?: percent(fraction)

    private const val FILL_EPSILON: Float = 1e-4f
}
