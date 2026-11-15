package me.meeshy.ui.component.reading

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.sdk.model.reading.mode.ReadingModeChoice
import me.meeshy.sdk.model.reading.mode.ReadingModeMenuEntry
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La feuille Lens : les cinq modes avec leur sous-titre, puis « Automatique ». Une entrée grisée
 * reste listée avec sa raison vivante ; choisir une entrée ferme la feuille. Même catalogue et même
 * préférence que la puce et le sous-menu de la liste.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun ReadingModeLensSheet(
    entries: List<ReadingModeMenuEntry>,
    accentColor: Color,
    onSelect: (ConversationReadingMode) -> Unit,
    onAuto: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        Column(Modifier.fillMaxWidth().padding(bottom = MeeshySpacing.lg)) {
            (entries.filter { it.choice != ReadingModeChoice.Auto } + entries.filter { it.choice == ReadingModeChoice.Auto })
                .forEach { entry ->
                    LensSheetRow(entry, accentColor) {
                        when (val choice = entry.choice) {
                            ReadingModeChoice.Auto -> onAuto()
                            is ReadingModeChoice.Mode -> onSelect(choice.mode)
                        }
                        onDismiss()
                    }
                }
        }
    }
}

@Composable
private fun LensSheetRow(entry: ReadingModeMenuEntry, accentColor: Color, onClick: () -> Unit) {
    val announcement = readingModeEntryAnnouncement(entry)
    val activate = onClick
    val subtitle = readingModeSubtitle(entry)
    Row(
        modifier = Modifier
            .testTag(readingModeEntryTestTag(entry.choice))
            .fillMaxWidth()
            .defaultMinSize(minHeight = 56.dp)
            .alpha(if (entry.isDisabled) 0.45f else 1f)
            .clickable(enabled = !entry.isDisabled, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
            .clearAndSetSemantics {
                contentDescription = announcement
                role = Role.Button
                selected = entry.isSelected
                if (entry.isDisabled) disabled() else onClick(label = null) { activate(); true }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = readingModeChoiceTitle(entry.choice),
                fontWeight = if (entry.isSelected) FontWeight.SemiBold else FontWeight.Normal,
                color = MeeshyTheme.tokens.textPrimary,
            )
            if (subtitle != null) {
                Text(subtitle, fontSize = MeeshyFontSize.caption, color = MeeshyTheme.tokens.textSecondary)
            }
        }
        if (entry.isSelected) {
            Icon(MeeshyIcons.Check, contentDescription = null, tint = accentColor, modifier = Modifier.size(20.dp))
        } else {
            Spacer(Modifier.size(20.dp))
        }
    }
}
