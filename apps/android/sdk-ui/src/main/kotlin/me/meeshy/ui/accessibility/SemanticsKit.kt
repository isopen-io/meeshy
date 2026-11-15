package me.meeshy.ui.accessibility

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import me.meeshy.sdk.model.accessibility.AdjustDirection
import me.meeshy.ui.R

/** Interrupteur à deux états : rôle Switch et valeur « Activé / Désactivé » localisée. */
public fun Modifier.toggleStateSemantics(isActive: Boolean, onLabel: String, offLabel: String): Modifier =
    semantics {
        role = Role.Switch
        stateDescription = if (isActive) onLabel else offLabel
    }

@Composable
public fun Modifier.toggleState(isActive: Boolean): Modifier =
    toggleStateSemantics(
        isActive = isActive,
        onLabel = stringResource(R.string.a11y_kit_toggle_on),
        offLabel = stringResource(R.string.a11y_kit_toggle_off),
    )

/**
 * Poignée ajustable (curseur, tête de lecture) : valeur en [progressBarRangeInfo], actions
 * augmenter/diminuer pour TalkBack. [onAdjust] reçoit la direction ; l'hôte applique son pas.
 */
@Composable
public fun Modifier.meeshyAdjustable(
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    valueLabel: String,
    onAdjust: (AdjustDirection) -> Unit,
): Modifier {
    val increase = stringResource(R.string.a11y_kit_increase)
    val decrease = stringResource(R.string.a11y_kit_decrease)
    return semantics {
        progressBarRangeInfo = ProgressBarRangeInfo(value.coerceIn(range), range)
        stateDescription = valueLabel
        setProgress { target ->
            val direction = if (target >= value) AdjustDirection.INCREMENT else AdjustDirection.DECREMENT
            onAdjust(direction)
            true
        }
        customActions = listOf(
            CustomAccessibilityAction(increase) { onAdjust(AdjustDirection.INCREMENT); true },
            CustomAccessibilityAction(decrease) { onAdjust(AdjustDirection.DECREMENT); true },
        )
    }
}
