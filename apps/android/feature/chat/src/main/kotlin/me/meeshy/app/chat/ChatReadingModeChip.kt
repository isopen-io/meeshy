package me.meeshy.app.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.LensRow
import me.meeshy.sdk.model.reading.mode.LensUnavailableReason
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LE chip de mode de lecture — miroir de `ReadingModeChip` (iOS, spec Magnificence 2026-08-17) :
 * capsule teintée de l'accent (fond 28 %, contour 50 % hairline), encoche « AUTO » quand la
 * décision vient de l'orchestrateur, puis le nom du mode. TAP = cycle des vues disponibles
 * (haptique légère), APPUI LONG = menu listant les cinq modes, la ligne courante cochée, une
 * ligne indisponible grisée avec sa raison (jamais retirée), puis « Automatique ».
 *
 * Écart Android assumé : tant qu'il n'y a qu'une vue rendue, le cycle est vide (no-op iOS) ;
 * le tap ouvre alors le menu plutôt que de ne rien faire.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ChatReadingModeChip(
    state: ReadingModeUiState,
    accentColor: Color,
    onSelect: (ConversationReadingMode) -> Unit,
    onAuto: () -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    var menuOpen by remember { mutableStateOf(false) }
    val isDark = MeeshyTheme.isDark
    val labelColor = if (isDark) Color.White else MeeshyTheme.tokens.textPrimary
    val title = readingModeTitle(state.mode)
    val next = state.nextInCycle
    val cycle: () -> Unit = {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        if (next != null) onSelect(next) else menuOpen = true
    }
    val openMenu: () -> Unit = {
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        menuOpen = true
    }
    val a11yLabel = stringResource(R.string.reading_mode_chip_a11y_label, title)
    val a11yHint = stringResource(R.string.reading_mode_chip_a11y_hint_cycle)
    val autoPrefix = stringResource(R.string.reading_mode_chip_auto_prefix)
    val capsule = RoundedCornerShape(percent = 50)
    Box {
        Box(
            modifier = Modifier
                .defaultMinSize(minHeight = ChatHeaderMetrics.TAP_TARGET)
                .clip(capsule)
                .combinedClickable(onClick = cycle, onLongClick = openMenu)
                .clearAndSetSemantics {
                    contentDescription = a11yLabel
                    if (state.isAuto) stateDescription = autoPrefix
                    role = Role.Button
                    onClick(label = a11yHint) { cycle(); true }
                    customActions = listOf(CustomAccessibilityAction(a11yHint) { menuOpen = true; true })
                },
            contentAlignment = Alignment.Center,
        ) {
            Row(
                modifier = Modifier
                    .clip(capsule)
                    .background(accentColor.copy(alpha = 0.28f))
                    .border(MeeshyBorder.hairline, accentColor.copy(alpha = 0.5f), capsule)
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (state.isAuto) {
                    Text(
                        text = autoPrefix,
                        fontSize = MeeshyFontSize.micro,
                        fontWeight = FontWeight.Black,
                        color = labelColor.copy(alpha = 0.65f),
                        maxLines = 1,
                        softWrap = false,
                    )
                }
                Text(
                    text = title,
                    fontSize = MeeshyFontSize.subhead,
                    fontWeight = FontWeight.SemiBold,
                    color = labelColor,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
        DropdownMenu(
            expanded = menuOpen,
            onDismissRequest = { menuOpen = false },
            containerColor = MeeshyTheme.tokens.backgroundSecondary,
        ) {
            state.rows.forEach { row ->
                ReadingModeMenuRow(
                    row = row,
                    accentColor = accentColor,
                    onClick = { menuOpen = false; onSelect(row.mode) },
                )
            }
            HorizontalDivider()
            DropdownMenuItem(
                text = { Text(stringResource(R.string.reading_mode_menu_auto)) },
                leadingIcon = { Icon(MeeshyIcons.MagicWand, contentDescription = null, tint = accentColor) },
                onClick = { menuOpen = false; onAuto() },
            )
        }
    }
}

@Composable
private fun ReadingModeMenuRow(row: LensRow, accentColor: Color, onClick: () -> Unit) {
    val enabled = row.isAvailable && !row.isCurrent
    DropdownMenuItem(
        text = {
            Column {
                Text(readingModeTitle(row.mode), fontWeight = if (row.isCurrent) FontWeight.SemiBold else FontWeight.Normal)
                Text(
                    text = readingModeSubtitle(row),
                    fontSize = MeeshyFontSize.micro.times(1.2f),
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        },
        leadingIcon = {
            if (row.isCurrent) {
                Icon(MeeshyIcons.Check, contentDescription = null, tint = accentColor, modifier = Modifier.size(18.dp))
            } else {
                Spacer(Modifier.size(18.dp))
            }
        },
        enabled = enabled,
        onClick = onClick,
    )
}

@Composable
internal fun readingModeTitle(mode: ConversationReadingMode): String = stringResource(
    when (mode) {
        ConversationReadingMode.FOCAL -> R.string.reading_mode_focal_title
        ConversationReadingMode.SCRIPT -> R.string.reading_mode_script_title
        ConversationReadingMode.SUMMARY -> R.string.reading_mode_summary_title
        ConversationReadingMode.RIVER -> R.string.reading_mode_river_title
        ConversationReadingMode.BUBBLES -> R.string.reading_mode_bubbles_title
    },
)

/** Le sous-titre d'une ligne : la description du mode, ou la VRAIE raison s'il est grisé. */
@Composable
private fun readingModeSubtitle(row: LensRow): String = when (val reason = row.unavailableReason) {
    null -> stringResource(
        when (row.mode) {
            ConversationReadingMode.FOCAL -> R.string.reading_mode_focal_subtitle
            ConversationReadingMode.SCRIPT -> R.string.reading_mode_script_subtitle
            ConversationReadingMode.SUMMARY -> R.string.reading_mode_summary_subtitle
            ConversationReadingMode.RIVER -> R.string.reading_mode_river_subtitle
            ConversationReadingMode.BUBBLES -> R.string.reading_mode_bubbles_subtitle
        },
    )
    LensUnavailableReason.RiverNever -> stringResource(R.string.reading_mode_river_never)
    is LensUnavailableReason.RiverThresholdOnly -> stringResource(R.string.reading_mode_river_threshold_only, reason.threshold)
    is LensUnavailableReason.RiverBelowThreshold ->
        stringResource(R.string.reading_mode_river_unavailable_reason, reason.threshold, reason.current)
    LensUnavailableReason.Generic -> stringResource(R.string.reading_mode_unavailable_generic)
    LensUnavailableReason.NotYetRendered -> stringResource(R.string.reading_mode_not_yet_rendered)
}
