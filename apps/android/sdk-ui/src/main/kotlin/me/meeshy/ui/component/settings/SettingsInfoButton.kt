package me.meeshy.ui.component.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * Bouton « i » accolé au titre. Il a sa propre cible de 48 dp et reste un nœud d'accessibilité
 * distinct de la rangée : fusionné, il serait inatteignable au lecteur d'écran.
 */
@Composable
public fun SettingsInfoButton(
    info: SettingsInfo,
    color: Color,
    onClick: (SettingsInfo) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val label = stringResource(R.string.settings_info_button_label, info.title)
    Box(
        modifier = modifier
            .size(SettingsRowMetrics.minimumHeight)
            .clickable(onClickLabel = label, role = Role.Button) {
                haptics.light()
                onClick(info)
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Outlined.Info,
            contentDescription = label,
            tint = color.copy(alpha = 0.7f),
            modifier = Modifier.size(18.dp),
        )
    }
}
