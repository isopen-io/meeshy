package me.meeshy.app.game.pages

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.GameErrorMessages
import me.meeshy.app.game.gestures.GameGestureFailure
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val PILL_MILLIS = 160
private const val DISABLED_ALPHA = 0.5f
private const val SELECTED_FILL_ALPHA = 0.14f
private const val IDLE_FILL_ALPHA = 0.08f

/** Le refus du dernier essai d'une écriture, en une phrase — jamais un code. `null` quand il n'y en a pas. */
@Composable
internal fun arrangementFailureMessage(failure: GameGestureFailure?): String? {
    if (failure == null) return null
    val resources = LocalContext.current.resources
    return if (failure.offline) stringResource(R.string.game2_offline_action) else GameErrorMessages.message(resources, failure.code)
}

/**
 * Qui voit : trois pastilles (tout le monde, mes amis, moi seul), iOS `GameVisibilityPickerView`. PENDANT
 * l'enregistrement le choix est SUSPENDU sans être désactivé (la pastille que le doigt vient de choisir garde le focus de
 * TalkBack) ; hors ligne, ou jeu masqué, il est désactivé pour de bon. Il ne décide rien : la passerelle plafonne et
 * répond avec la valeur EFFECTIVE, que la relecture pose. Les pastilles passent à la ligne aux grandes tailles de texte.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun GameVisibilityPicker(
    legend: String,
    value: ShowcaseVisibility,
    enabled: Boolean,
    busy: Boolean,
    onChange: (ShowcaseVisibility) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    Column(modifier, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(legend, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            ShowcaseVisibility.entries.forEach { level ->
                VisibilityPill(
                    level = level,
                    selected = level == value,
                    enabled = enabled,
                    onClick = {
                        if (!busy && level != value) {
                            haptics.light()
                            onChange(level)
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun VisibilityPill(level: ShowcaseVisibility, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val reduce = LocalReduceMotion.current
    val spec = if (reduce) tween<androidx.compose.ui.graphics.Color>(0) else tween(PILL_MILLIS)
    val accent = MeeshyPalette.Indigo500
    val fill by animateColorAsState(
        if (selected) accent.copy(alpha = SELECTED_FILL_ALPHA) else MeeshyTheme.tokens.textMuted.copy(alpha = IDLE_FILL_ALPHA),
        spec,
        label = "pillFill",
    )
    val border by animateColorAsState(if (selected) accent else androidx.compose.ui.graphics.Color.Transparent, spec, label = "pillBorder")
    Surface(
        modifier = Modifier
            .defaultMinSize(minWidth = 44.dp, minHeight = 44.dp)
            .alpha(if (enabled) 1f else DISABLED_ALPHA)
            .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick),
        shape = RoundedCornerShape(MeeshyRadius.pill),
        color = fill,
        border = BorderStroke(1.5.dp, border),
    ) {
        Box(Modifier.defaultMinSize(minHeight = 44.dp).padding(horizontal = MeeshySpacing.md), contentAlignment = Alignment.Center) {
            Text(
                stringResource(visibilityRes(level)),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (selected) accent else MeeshyTheme.tokens.textPrimary,
            )
        }
    }
}

/** Monter, descendre : deux boutons de 44 dp par coupe — pas un glisser-déposer que ni TalkBack ni le clavier ne savent faire. */
@Composable
internal fun TrophyMoveButtons(
    name: String,
    index: Int,
    count: Int,
    enabled: Boolean,
    busy: Boolean,
    onUp: () -> Unit,
    onDown: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        MoveButton(MeeshyIcons.ChevronUp, stringResource(R.string.game2_showcase_move_up, name), enabled && index > 0, busy, onUp)
        MoveButton(MeeshyIcons.ChevronDown, stringResource(R.string.game2_showcase_move_down, name), enabled && index < count - 1, busy, onDown)
    }
}

/** Pendant qu'un ordre part, ranger est SUSPENDU sans être désactivé : le bouton que TalkBack vient de presser garde le focus. */
@Composable
private fun MoveButton(icon: ImageVector, label: String, enabled: Boolean, busy: Boolean, onClick: () -> Unit) {
    val haptics = rememberMeeshyHaptics()
    Box(
        Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(MeeshyTheme.tokens.textMuted.copy(alpha = IDLE_FILL_ALPHA))
            .alpha(if (enabled && !busy) 1f else DISABLED_ALPHA)
            .semantics { contentDescription = label }
            .clickable(enabled = enabled, role = Role.Button) {
                if (!busy) {
                    haptics.light()
                    onClick()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textPrimary, modifier = Modifier.size(24.dp))
    }
}
