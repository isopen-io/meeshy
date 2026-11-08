package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.component.chrome.leadingNavigationIcon
import me.meeshy.ui.component.chrome.leadingNavigationLabel

/**
 * « Plus d'options » des notifications (iOS `NotificationSettingsView`) : e-mail, aperçu,
 * nom de l'expéditeur, groupement, pastille, ne pas déranger et types d'événements. Les trois
 * interrupteurs de tête (push, sons, vibrations) restent sur l'écran Réglages, comme sur iOS.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationSettingsScreen(
    onBack: () -> Unit,
    viewModel: NotificationSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val notifications = state.notifications

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.settings_notifications_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                leadingNavigationIcon(),
                                contentDescription = leadingNavigationLabel(stringResource(R.string.settings_back)),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                PushNotificationToggle(
                    pushEnabled = notifications.pushEnabled,
                    onSetPushEnabled = viewModel::setPushEnabled,
                )
                SettingsCard(tint = MeeshyPalette.Warning) {
                    NotificationToggleRow(
                        label = stringResource(R.string.settings_notif_sounds),
                        checked = notifications.soundEnabled,
                        enabled = notifications.pushEnabled,
                        onCheckedChange = viewModel::setSoundEnabled,
                        icon = MeeshyIcons.VolumeUp,
                        color = MeeshyPalette.Indigo300,
                    )
                    NotificationToggleRow(
                        label = stringResource(R.string.settings_notif_vibrations),
                        checked = notifications.vibrationEnabled,
                        enabled = notifications.pushEnabled,
                        onCheckedChange = viewModel::setVibrationEnabled,
                        color = MeeshyPalette.TrackingAccent,
                    )
                    NotificationToggleRow(
                        label = stringResource(R.string.settings_email_notifications),
                        checked = notifications.emailEnabled,
                        onCheckedChange = viewModel::setEmailEnabled,
                    )
                    NotificationToggleRow(
                        label = stringResource(R.string.settings_new_message_notifications),
                        checked = notifications.newMessageEnabled,
                        enabled = notifications.pushEnabled,
                        onCheckedChange = viewModel::setNewMessageEnabled,
                    )
                    NotificationToggleRow(
                        label = stringResource(R.string.settings_notif_show_preview),
                        checked = notifications.showPreview,
                        enabled = notifications.pushEnabled,
                        onCheckedChange = viewModel::setShowPreview,
                    )
                    NotificationToggleRow(
                        label = stringResource(R.string.settings_notif_show_sender_name),
                        checked = notifications.showSenderName,
                        enabled = notifications.pushEnabled,
                        onCheckedChange = viewModel::setShowSenderName,
                    )
                    NotificationToggleRow(
                        label = stringResource(R.string.settings_notif_group_notifications),
                        checked = notifications.groupNotifications,
                        enabled = notifications.pushEnabled,
                        onCheckedChange = viewModel::setGroupNotifications,
                    )
                    NotificationToggleRow(
                        label = stringResource(R.string.settings_notif_badge_enabled),
                        checked = notifications.notificationBadgeEnabled,
                        enabled = notifications.pushEnabled,
                        onCheckedChange = viewModel::setNotificationBadgeEnabled,
                    )
                }
                SettingsCard(tint = MeeshyPalette.Indigo500) {
                    DndScheduleRows(
                        notifications = notifications,
                        onSetEnabled = viewModel::setDndEnabled,
                        onSetStart = viewModel::setDndStart,
                        onSetEnd = viewModel::setDndEnd,
                        onToggleDay = viewModel::toggleDndDay,
                    )
                }
                CircleNotifySection(
                    chosen = notifications.circleAudience,
                    onChoose = viewModel::setCircleAudience,
                )
                NotificationTypesEditor(
                    notifications = notifications,
                    query = state.notificationTypeQuery,
                    onQueryChange = viewModel::setNotificationTypeQuery,
                    onToggleType = viewModel::setNotificationTypeEnabled,
                )
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}
