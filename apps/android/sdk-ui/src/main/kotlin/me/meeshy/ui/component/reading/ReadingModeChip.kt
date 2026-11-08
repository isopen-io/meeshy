package me.meeshy.ui.component.reading

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
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
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuEntry
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyBorder
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.boundedScale

public const val READING_MODE_CHIP_TAG: String = "reading-mode-chip"

/**
 * LE chip de mode de lecture — miroir de `ReadingModeChip` (iOS) : capsule teintée de l'accent
 * (fond 28 %, contour 50 %), préfixe « AUTO » à 65 % quand la décision vient de l'orchestrateur.
 * TAP = cycle vers [nextInCycle] (haptique légère), APPUI LONG = menu des six entrées, la courante
 * cochée, les indisponibles grisées avec leur raison. Écart Android assumé : sans vue vers laquelle
 * cycler, le tap ouvre le menu plutôt que de ne rien faire. Zone tactile 44 dp.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
public fun ReadingModeChip(
    mode: ConversationReadingMode,
    isAuto: Boolean,
    entries: List<ReadingModeMenuEntry>,
    nextInCycle: ConversationReadingMode?,
    accentColor: Color,
    onSelect: (ConversationReadingMode) -> Unit,
    onAuto: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    var menuOpen by remember { mutableStateOf(false) }
    val labelColor = if (MeeshyTheme.isDark) Color.White else MeeshyTheme.tokens.textPrimary
    val title = readingModeTitle(mode)
    val cycle: () -> Unit = {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        if (nextInCycle != null) onSelect(nextInCycle) else menuOpen = true
    }
    val openMenu: () -> Unit = {
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        menuOpen = true
    }
    val a11yLabel = stringResource(R.string.reading_mode_chip_a11y_label, title)
    val a11yHint = stringResource(R.string.reading_mode_chip_a11y_hint_cycle)
    val autoPrefix = stringResource(R.string.reading_mode_chip_auto_prefix)
    val capsule = RoundedCornerShape(percent = 50)
    Box(modifier) {
        Box(
            modifier = Modifier
                .testTag(READING_MODE_CHIP_TAG)
                .defaultMinSize(minHeight = 44.dp, minWidth = 44.dp)
                .clip(capsule)
                .combinedClickable(onClick = cycle, onLongClick = openMenu)
                .clearAndSetSemantics {
                    contentDescription = a11yLabel
                    if (isAuto) stateDescription = autoPrefix
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
                if (isAuto) {
                    Text(
                        text = autoPrefix,
                        fontSize = MeeshyFontSize.micro.boundedScale(),
                        fontWeight = FontWeight.Black,
                        color = labelColor.copy(alpha = 0.65f),
                        maxLines = 1,
                        softWrap = false,
                    )
                }
                Text(
                    text = title,
                    fontSize = MeeshyFontSize.subhead.boundedScale(),
                    fontWeight = FontWeight.SemiBold,
                    color = labelColor,
                    maxLines = 1,
                    softWrap = false,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }
        }
        DropdownMenu(
            expanded = menuOpen,
            onDismissRequest = { menuOpen = false },
            containerColor = MeeshyTheme.tokens.backgroundSecondary,
        ) {
            entries.forEach { entry ->
                ReadingModeMenuItem(
                    entry = entry,
                    accentColor = accentColor,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        menuOpen = false
                        when (val choice = entry.choice) {
                            ReadingModeChoice.Auto -> onAuto()
                            is ReadingModeChoice.Mode -> onSelect(choice.mode)
                        }
                    },
                )
            }
        }
    }
}
