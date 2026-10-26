package me.meeshy.app.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.component.settings.SettingsSwitchRow
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Rangée de navigation d'iOS `settingsRow` + chevron : tuile teintée, valeur facultative, haptique légère. */
@Composable
internal fun SettingsChevronRow(
    icon: ImageVector,
    title: String,
    color: Color,
    onClick: () -> Unit,
    value: String? = null,
    heavyHaptic: Boolean = false,
    chevronTint: Color = MeeshyTheme.tokens.textMuted,
) {
    val haptics = rememberMeeshyHaptics()
    SettingsRow(
        icon = icon,
        title = title,
        color = color,
        value = value,
        modifier = Modifier.clickable(role = Role.Button) {
            if (heavyHaptic) haptics.heavy() else haptics.light()
            onClick()
        },
        trailing = {
            if (value != null) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                )
                Spacer(Modifier.width(MeeshySpacing.xs))
            }
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = chevronTint,
                modifier = Modifier.size(20.dp),
            )
        },
    )
}

/** Interrupteur de réglage : bascule à l'écran (état hissé, donc optimiste) avec un retour haptique de sélection. */
@Composable
internal fun NotificationToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
    icon: ImageVector = Icons.Filled.Notifications,
    color: Color = MeeshyPalette.Warning,
) {
    val haptics = rememberMeeshyHaptics()
    SettingsSwitchRow(
        icon = icon,
        title = label,
        color = color,
        checked = checked,
        enabled = enabled,
        onCheckedChange = {
            haptics.selection()
            onCheckedChange(it)
        },
    )
}
