package me.meeshy.app.settings

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.settings.SettingsHubRow
import me.meeshy.sdk.model.settings.SettingsHubRowId
import me.meeshy.ui.theme.MeeshyPalette

/** Notifications rapides (iOS) : push, sons, vibrations (grisés si push coupé), puis « Plus d'options ». */
@Composable
internal fun SettingsNotificationsQuickSection(
    rows: List<SettingsHubRow>,
    onOpenNotificationSettings: () -> Unit,
    viewModel: NotificationSettingsViewModel = hiltViewModel(),
) {
    val tint = MeeshyPalette.Error
    val state by viewModel.state.collectAsStateWithLifecycle()
    val notifications = state.notifications
    SettingsGroup(stringResource(R.string.settings_section_notifications), MeeshyIcons.BellFilled, tint) {
        SettingsRows(rows, tint) { row ->
            when (row.id) {
                SettingsHubRowId.NOTIF_PUSH -> PushNotificationToggle(
                    pushEnabled = notifications.pushEnabled,
                    onSetPushEnabled = viewModel::setPushEnabled,
                )
                SettingsHubRowId.NOTIF_SOUNDS -> NotificationToggleRow(
                    label = stringResource(R.string.settings_notif_sounds),
                    checked = notifications.soundEnabled,
                    enabled = notifications.pushEnabled,
                    onCheckedChange = viewModel::setSoundEnabled,
                    icon = MeeshyIcons.VolumeUpFilled,
                    color = MeeshyPalette.Indigo300,
                )
                SettingsHubRowId.NOTIF_VIBRATIONS -> NotificationToggleRow(
                    label = stringResource(R.string.settings_notif_vibrations),
                    checked = notifications.vibrationEnabled,
                    enabled = notifications.pushEnabled,
                    onCheckedChange = viewModel::setVibrationEnabled,
                    icon = MeeshyIcons.Vibration,
                    color = MeeshyPalette.TrackingAccent,
                )
                SettingsHubRowId.NOTIF_MORE_OPTIONS -> SettingsChevronRow(
                    MeeshyIcons.Tune,
                    stringResource(R.string.settings_notif_more_options),
                    MeeshyPalette.Error,
                    onOpenNotificationSettings,
                )
                else -> Unit
            }
        }
    }
}
