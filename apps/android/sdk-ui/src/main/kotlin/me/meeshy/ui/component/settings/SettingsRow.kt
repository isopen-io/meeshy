package me.meeshy.ui.component.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Une rangée de réglage : tuile d'icône teintée, titre, sous-titre optionnel, bouton « i »
 * optionnel et contenu de fin libre (valeur, chevron, interrupteur).
 *
 * [value] n'est pas dessiné : c'est la valeur que le contenu de fin affiche, annoncée avec le titre
 * (« titre, valeur »). Le bouton « i » reste un nœud distinct, hors de la sémantique fusionnée.
 */
@Composable
public fun SettingsRow(
    icon: ImageVector,
    title: String,
    color: Color,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    value: String? = null,
    info: SettingsInfo? = null,
    onInfo: ((SettingsInfo) -> Unit)? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val tokens = MeeshyTheme.tokens
    val spoken = SettingsRowMetrics.accessibilityLabel(title, value)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = SettingsRowMetrics.minimumHeight)
            .padding(horizontal = SettingsRowMetrics.horizontalPadding, vertical = SettingsRowMetrics.verticalPadding),
        horizontalArrangement = Arrangement.spacedBy(SettingsRowMetrics.iconTextSpacing),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .semantics(mergeDescendants = true) { contentDescription = spoken },
            horizontalArrangement = Arrangement.spacedBy(SettingsRowMetrics.iconTextSpacing),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconTile(icon, color)
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = tokens.textPrimary,
                )
                if (subtitle != null) {
                    Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = tokens.textSecondary)
                }
            }
        }
        if (info != null && onInfo != null) SettingsInfoButton(info = info, color = color, onClick = onInfo)
        Row(verticalAlignment = Alignment.CenterVertically, content = trailing)
    }
}

@Composable
private fun IconTile(icon: ImageVector, color: Color) {
    Box(
        modifier = Modifier
            .size(SettingsRowMetrics.iconSize)
            .background(color.copy(alpha = SettingsRowMetrics.ICON_TILE_ALPHA), RoundedCornerShape(MeeshyRadius.sm))
            .clearAndSetSemantics { },
        contentAlignment = Alignment.Center,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
    }
}
