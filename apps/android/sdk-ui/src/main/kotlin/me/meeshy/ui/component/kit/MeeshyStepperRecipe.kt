package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import java.util.Locale
import kotlin.math.max

/** Les trois formes : des boutons qui comptent, une piste de crans, des jalons en lecture (K53). */
public enum class MeeshyStepperKind { Buttons, Track, Milestones }

/** Deux tailles de disque : 44 ou 36. La cible reste toujours de 44. */
public enum class MeeshyStepperSize { Regular, Compact }

/** L'état d'un jalon par rapport à l'étape courante. */
public enum class MeeshyStepperMilestoneState {
    Done, Current, Todo;

    public companion object {
        public fun of(index: Int, current: Int): MeeshyStepperMilestoneState = when {
            index < current -> Done
            index == current -> Current
            else -> Todo
        }
    }
}

/** Le résultat d'un pas : la valeur bornée, et si la butée a été heurtée (pour que l'hôte la fasse sentir). */
public data class MeeshyStepperStep(val value: Int, val hitBound: Boolean)

/** Un palier de l'échelle de pas : à partir de [from], le pas vaut [step]. */
public data class MeeshyStepperRung(val from: Int, val step: Int)

/** **La loi du pas** : un entier avance d'un pas à la fois entre deux bornes. Miroir de `MeeshyStepperRule` (iOS). */
public object MeeshyStepperRule {
    public fun next(value: Int, delta: Int, range: IntRange, step: Int): MeeshyStepperStep {
        val start = value.coerceIn(range.first, range.last)
        val candidate = start + delta * max(step, 1)
        val clamped = candidate.coerceIn(range.first, range.last)
        return MeeshyStepperStep(clamped, hitBound = delta != 0 && clamped != candidate)
    }

    /** Le pas grandit avec la valeur : le dernier palier atteint gagne. */
    public fun step(forValue: Int, base: Int, ladder: List<MeeshyStepperRung>): Int =
        max(ladder.filter { it.from <= forValue }.maxByOrNull { it.from }?.step ?: base, 1)
}

/** Une transition de [MeeshyStepperHoldLaw] : le nouvel état, et s'il faut avancer d'un pas. */
public data class MeeshyStepperHoldTransition(val law: MeeshyStepperHoldLaw, val fires: Boolean)

/**
 * **La loi de l'appui** : un toucher avance d'un pas au relâcher ; tenu, la cadence avance seule et le relâcher n'ajoute rien.
 * Un geste annulé, un bouton éteint ou arrivé en butée arrête la cadence et ne compte pas comme un toucher.
 */
public data class MeeshyStepperHoldLaw(val isHeld: Boolean = false, val didRepeat: Boolean = false) {

    /** Le doigt se pose : `fires` une seule fois, quand il faut lancer la cadence. */
    public fun press(isActive: Boolean): MeeshyStepperHoldTransition =
        if (!isActive || isHeld) {
            MeeshyStepperHoldTransition(this, fires = false)
        } else {
            MeeshyStepperHoldTransition(MeeshyStepperHoldLaw(isHeld = true, didRepeat = false), fires = true)
        }

    /** Un battement de la cadence : `fires` s'il faut avancer ; un bouton éteint arrête l'appui. */
    public fun repeatTick(isActive: Boolean): MeeshyStepperHoldTransition = when {
        !isHeld -> MeeshyStepperHoldTransition(this, fires = false)
        !isActive -> MeeshyStepperHoldTransition(cancel(), fires = false)
        else -> MeeshyStepperHoldTransition(copy(didRepeat = true), fires = true)
    }

    /** Le doigt se lève : `fires` s'il faut avancer d'un pas (un toucher qui n'a pas répété). */
    public fun release(isActive: Boolean): MeeshyStepperHoldTransition =
        if (!isHeld) MeeshyStepperHoldTransition(this, fires = false) else MeeshyStepperHoldTransition(cancel(), fires = isActive && !didRepeat)

    /** Geste annulé, bouton éteint, vue partie : rien n'avance plus. */
    public fun cancel(): MeeshyStepperHoldLaw = MeeshyStepperHoldLaw()
}

@Immutable
public data class MeeshyStepperValues(
    val isRendered: Boolean,
    val capsuleHeightDp: Float,
    val capsuleInsetDp: Float,
    val capsuleGapDp: Float,
    val discDiameterDp: Float,
    val tapTargetDp: Float,
    val valueSizeSp: Float,
    val valueMinWidthDp: Float,
    val minusOpacity: Float,
    val plusOpacity: Float,
    val trackHeightDp: Float,
    val trackRadiusDp: Float,
    val markCellDp: Float,
    val markLabelGapDp: Float,
    val milestoneTraceHeightDp: Float,
    val milestoneTraceInsetDp: Float,
    val fillFraction: Float,
    val selectedIndex: Int,
    val acceptsGesture: Boolean,
    val fillsFromTrailingEdge: Boolean,
    val pressedScale: Float,
)

/**
 * **La recette de K53 en VALEURS** : mesures de chaque forme, atténuation aux butées, remplissage, appui long. Aucune couleur :
 * la teinte est celle de l'hôte. Miroir de `MeeshyStepperRecipe` (iOS).
 */
public object MeeshyStepperRecipe {
    public const val HOLD_FIRST_MILLIS: Int = 400
    public const val HOLD_FLOOR_MILLIS: Int = 60
    private const val HOLD_START_MILLIS: Int = 200
    private const val HOLD_ACCELERATION_MILLIS: Int = 20
    private const val MARK_MINIMUM_DP: Float = 10f
    private const val MARK_MAXIMUM_DP: Float = 56f
    private const val DIMMED_OPACITY: Float = 0.36f
    private const val PRESSED_SCALE: Float = 0.94f

    @Suppress("LongParameterList")
    public fun resolve(
        kind: MeeshyStepperKind,
        size: MeeshyStepperSize,
        value: Int,
        range: IntRange,
        stopCount: Int,
        isPressed: Boolean,
        isEnabled: Boolean,
        isRtl: Boolean,
        reduceMotion: Boolean,
    ): MeeshyStepperValues {
        val rendered = kind == MeeshyStepperKind.Buttons || stopCount in MIN_STOPS..MAX_STOPS
        val selected = if (stopCount > 0) value.coerceIn(0, stopCount - 1) else 0
        return MeeshyStepperValues(
            isRendered = rendered,
            capsuleHeightDp = 50f,
            capsuleInsetDp = 3f,
            capsuleGapDp = 4f,
            discDiameterDp = if (size == MeeshyStepperSize.Regular) 44f else 36f,
            tapTargetDp = 44f,
            valueSizeSp = 20f,
            valueMinWidthDp = 34f,
            minusOpacity = if (!isEnabled || value <= range.first) DIMMED_OPACITY else 1f,
            plusOpacity = if (!isEnabled || value >= range.last) DIMMED_OPACITY else 1f,
            trackHeightDp = 3f,
            trackRadiusDp = 2f,
            markCellDp = 60f,
            markLabelGapDp = 10f,
            milestoneTraceHeightDp = 3f,
            milestoneTraceInsetDp = 21f,
            fillFraction = if (stopCount > 1) selected.toFloat() / (stopCount - 1) else 0f,
            selectedIndex = selected,
            acceptsGesture = kind != MeeshyStepperKind.Milestones && isEnabled && rendered,
            fillsFromTrailingEdge = isRtl,
            pressedScale = if (isPressed && !reduceMotion) PRESSED_SCALE else 1f,
        )
    }

    /** Le diamètre d'un repère : donné par l'hôte, borné de 10 à 56 ; absent ou non fini, le plus petit. */
    public fun markDiameter(requested: Float?): Float =
        if (requested == null || !requested.isFinite()) MARK_MINIMUM_DP else requested.coerceIn(MARK_MINIMUM_DP, MARK_MAXIMUM_DP)

    /** L'attente avant le pas suivant d'un appui long : 400 ms au premier, puis la cadence accélère jusqu'à un plancher. */
    public fun holdDelayMillis(tick: Int): Int =
        if (tick <= 0) HOLD_FIRST_MILLIS else max(HOLD_FLOOR_MILLIS, HOLD_START_MILLIS - HOLD_ACCELERATION_MILLIS * (tick - 1))

    /** La voix dit la valeur, pas le geste : le texte de l'hôte, sinon le titre de l'arrêt, sinon le nombre. */
    public fun spokenValue(spoken: String?, value: Int, stopTitle: String?, locale: Locale): String = when {
        !spoken.isNullOrEmpty() -> spoken
        !stopTitle.isNullOrEmpty() -> stopTitle
        else -> MeeshyCircleScaleRecipe.countText(value, locale)
    }

    private const val MIN_STOPS: Int = 2
    private const val MAX_STOPS: Int = 5
}
