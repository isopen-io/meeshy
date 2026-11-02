package me.meeshy.ui.component.report

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.PanTool
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.model.report.ReportReasonGlyph
import me.meeshy.sdk.model.report.ReportReasonPresentation
import me.meeshy.ui.R
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal fun ReportReasonGlyph.imageVector(): ImageVector = when (this) {
    ReportReasonGlyph.ENVELOPE -> Icons.Filled.Email
    ReportReasonGlyph.RAISED_HAND -> Icons.Filled.PanTool
    ReportReasonGlyph.TRIANGLE -> Icons.Filled.Warning
    ReportReasonGlyph.SILHOUETTE -> Icons.Filled.Person
    ReportReasonGlyph.ELLIPSE -> Icons.Filled.MoreHoriz
    ReportReasonGlyph.BOLT -> Icons.Filled.Bolt
    ReportReasonGlyph.SPEECH_BUBBLE -> Icons.Filled.ChatBubble
}

/**
 * Liste de motifs de signalement : une ligne par motif (icône dédiée, libellé), la ligne choisie
 * est teintée, porte une coche et est annoncée « Sélectionné ». Le libellé vient de l'hôte
 * ([label]) : les chaînes de motifs appartiennent à la feature, pas à ce module.
 */
@Composable
public fun ReportReasonList(
    reasons: List<ReportReasonPresentation>,
    selected: ReportReason,
    onSelect: (ReportReason) -> Unit,
    label: @Composable (ReportReasonPresentation) -> String,
    modifier: Modifier = Modifier,
    separatorTint: Color = MeeshyTheme.tokens.textMuted,
) {
    Column(modifier = modifier) {
        reasons.forEachIndexed { index, presentation ->
            if (index > 0) SettingsSeparator(separatorTint)
            ReasonRow(
                presentation = presentation,
                text = label(presentation),
                isSelected = presentation.reason == selected,
                onClick = { onSelect(presentation.reason) },
            )
        }
    }
}

@Composable
private fun ReasonRow(
    presentation: ReportReasonPresentation,
    text: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val tint = if (isSelected) tokens.error else tokens.textMuted
    val selectedLabel = stringResource(R.string.common_selected)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .background(if (isSelected) tokens.error.copy(alpha = 0.08f) else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus)
            .semantics(mergeDescendants = true) {
                role = Role.RadioButton
                selected = isSelected
                if (isSelected) stateDescription = selectedLabel
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(tint.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(presentation.glyph.imageVector(), contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        }
        Text(
            text = text,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            color = tokens.textPrimary,
        )
        if (isSelected) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = tokens.error, modifier = Modifier.size(22.dp))
        }
    }
}
