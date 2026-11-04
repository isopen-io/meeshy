package me.meeshy.ui.component.reading

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuEntry
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyTheme

public fun readingModeEntryTestTag(choice: ReadingModeChoice): String = when (choice) {
    ReadingModeChoice.Auto -> "reading-mode-entry-auto"
    is ReadingModeChoice.Mode -> "reading-mode-entry-${choice.mode.wire}"
}

/**
 * UNE ligne du menu de mode : coche sur le choix courant, sous-titre (description ou raison
 * vivante), grisée si indisponible. Partagée par la puce du fil et le sous-menu de la liste — le
 * même dessin pour le même état.
 */
@Composable
public fun ReadingModeMenuItem(
    entry: ReadingModeMenuEntry,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val announcement = readingModeEntryAnnouncement(entry)
    val activate = onClick
    val subtitle = readingModeSubtitle(entry)
    DropdownMenuItem(
        text = {
            Column {
                Text(
                    text = readingModeChoiceTitle(entry.choice),
                    fontWeight = if (entry.isSelected) FontWeight.SemiBold else FontWeight.Normal,
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        fontSize = MeeshyFontSize.micro.times(1.2f),
                        color = MeeshyTheme.tokens.textSecondary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        },
        leadingIcon = {
            when {
                entry.isSelected -> Icon(MeeshyIcons.Check, contentDescription = null, tint = accentColor, modifier = Modifier.size(18.dp))
                entry.choice == ReadingModeChoice.Auto -> Icon(MeeshyIcons.MagicWand, contentDescription = null, tint = accentColor, modifier = Modifier.size(18.dp))
                else -> Spacer(Modifier.size(18.dp))
            }
        },
        enabled = !entry.isDisabled,
        onClick = onClick,
        modifier = modifier
            .testTag(readingModeEntryTestTag(entry.choice))
            .clearAndSetSemantics {
                contentDescription = announcement
                role = Role.Button
                selected = entry.isSelected
                if (entry.isDisabled) disabled() else onClick(label = null) { activate(); true }
            },
    )
}
