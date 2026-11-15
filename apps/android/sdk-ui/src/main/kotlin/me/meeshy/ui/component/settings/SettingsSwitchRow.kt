package me.meeshy.ui.component.settings

import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.selection.toggleable
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyPalette

/** Rangée à interrupteur teinté brandPrimary ; la rangée entière bascule et annonce Activé/Désactivé. */
@Composable
public fun SettingsSwitchRow(
    icon: ImageVector,
    title: String,
    color: Color,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    enabled: Boolean = true,
    info: SettingsInfo? = null,
    onInfo: ((SettingsInfo) -> Unit)? = null,
) {
    val state = stringResource(if (checked) R.string.a11y_kit_toggle_on else R.string.a11y_kit_toggle_off)
    SettingsRow(
        icon = icon,
        title = title,
        color = color,
        subtitle = subtitle,
        value = state,
        info = info,
        onInfo = onInfo,
        modifier = modifier.toggleable(
            value = checked,
            enabled = enabled,
            role = Role.Switch,
            onValueChange = onCheckedChange,
        ).semantics { stateDescription = state },
        trailing = { SwitchTrailing(checked, enabled) },
    )
}

@Composable
private fun RowScope.SwitchTrailing(checked: Boolean, enabled: Boolean) {
    Switch(
        checked = checked,
        onCheckedChange = null,
        enabled = enabled,
        colors = SwitchDefaults.colors(checkedTrackColor = MeeshyPalette.Indigo500),
        modifier = Modifier.clearAndSetSemantics { },
    )
}
