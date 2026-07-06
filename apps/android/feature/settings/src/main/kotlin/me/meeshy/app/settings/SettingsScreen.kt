package me.meeshy.app.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForwardIos
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.LocalDateTime
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.AppLanguage
import me.meeshy.sdk.model.AppThemeMode
import me.meeshy.sdk.model.DndDay
import me.meeshy.sdk.model.DndWindow
import me.meeshy.sdk.model.NotificationCategory
import me.meeshy.sdk.model.NotificationType
import me.meeshy.sdk.model.NotificationTypeCatalog
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshySpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLogout: () -> Unit,
    onOpenProfile: (String) -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.settings_back),
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
                .verticalScroll(rememberScrollState()),
        ) {
            SettingsSection(title = stringResource(R.string.settings_section_profile)) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = state.userId != null) {
                            state.userId?.let(onOpenProfile)
                        }
                        .semantics { role = Role.Button }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MeeshyAvatar(
                        name = state.username ?: "?",
                        modifier = Modifier.size(48.dp),
                    )
                    Spacer(Modifier.width(MeeshySpacing.md))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = state.username ?: "",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        state.email?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }

            SettingsSection(title = stringResource(R.string.settings_section_appearance)) {
                ThemePickerRow(
                    label = stringResource(R.string.settings_theme),
                    selected = state.themeMode,
                    onSelect = viewModel::setThemeMode,
                )
            }

            SettingsSection(title = stringResource(R.string.settings_section_language)) {
                InterfaceLanguageRow(
                    label = stringResource(R.string.settings_display_language),
                    selected = state.interfaceLanguage,
                    onSelect = viewModel::setInterfaceLanguage,
                )
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_regional_language), detail = null, onClick = {})
            }

            SettingsSection(title = stringResource(R.string.settings_section_notifications)) {
                val notifications = state.notifications
                NotificationToggleRow(
                    label = stringResource(R.string.settings_push_notifications),
                    checked = notifications.pushEnabled,
                    onCheckedChange = viewModel::setPushEnabled,
                )
                NotificationToggleRow(
                    label = stringResource(R.string.settings_new_message_notifications),
                    checked = notifications.newMessageEnabled,
                    enabled = notifications.pushEnabled,
                    onCheckedChange = viewModel::setNewMessageEnabled,
                )
                NotificationToggleRow(
                    label = stringResource(R.string.settings_notification_sound),
                    checked = notifications.soundEnabled,
                    enabled = notifications.pushEnabled,
                    onCheckedChange = viewModel::setSoundEnabled,
                )
                NotificationToggleRow(
                    label = stringResource(R.string.settings_notification_vibration),
                    checked = notifications.vibrationEnabled,
                    enabled = notifications.pushEnabled,
                    onCheckedChange = viewModel::setVibrationEnabled,
                )
                DndScheduleRows(
                    notifications = notifications,
                    onSetEnabled = viewModel::setDndEnabled,
                    onSetStart = viewModel::setDndStart,
                    onSetEnd = viewModel::setDndEnd,
                    onToggleDay = viewModel::toggleDndDay,
                )
                NotificationTypesEditor(
                    notifications = notifications,
                    query = state.notificationTypeQuery,
                    onQueryChange = viewModel::setNotificationTypeQuery,
                    onToggleType = viewModel::setNotificationTypeEnabled,
                )
            }

            SettingsSection(title = stringResource(R.string.settings_section_privacy)) {
                SettingsRow(label = stringResource(R.string.settings_two_factor), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_active_sessions), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_blocked_users), detail = null, onClick = {})
            }

            SettingsSection(title = stringResource(R.string.settings_section_data)) {
                SettingsRow(label = stringResource(R.string.settings_export_data), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_clear_media_cache), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_storage_used), detail = null, onClick = {})
            }

            SettingsSection(title = stringResource(R.string.settings_section_about)) {
                SettingsRow(label = stringResource(R.string.settings_version), detail = null, onClick = null)
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_terms_of_service), detail = null, onClick = {})
                HorizontalDivider(modifier = Modifier.padding(start = MeeshySpacing.lg))
                SettingsRow(label = stringResource(R.string.settings_privacy_policy), detail = null, onClick = {})
            }

            SettingsSection(title = stringResource(R.string.settings_section_danger)) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                    verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    Button(
                        onClick = onLogout,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error,
                        ),
                    ) {
                        Text(stringResource(R.string.settings_log_out))
                    }
                    SettingsRow(
                        label = stringResource(R.string.settings_delete_account),
                        detail = null,
                        onClick = {},
                        labelColor = MaterialTheme.colorScheme.error,
                    )
                }
            }

            Spacer(Modifier.height(MeeshySpacing.xl))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ThemePickerRow(
    label: String,
    selected: AppThemeMode,
    onSelect: (AppThemeMode) -> Unit,
) {
    val options = listOf(
        AppThemeMode.AUTO to R.string.settings_theme_system,
        AppThemeMode.LIGHT to R.string.settings_theme_light,
        AppThemeMode.DARK to R.string.settings_theme_dark,
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(Modifier.height(MeeshySpacing.sm))
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            options.forEachIndexed { index, (mode, labelRes) ->
                SegmentedButton(
                    selected = mode == selected,
                    onClick = { onSelect(mode) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size),
                ) {
                    Text(stringResource(labelRes))
                }
            }
        }
    }
}

@Composable
private fun InterfaceLanguageRow(
    label: String,
    selected: String?,
    onSelect: (String?) -> Unit,
) {
    var showDialog by remember { mutableStateOf(false) }
    val systemLabel = stringResource(R.string.settings_language_system)
    val detail = selected?.let { AppLanguage.info(it)?.nativeName } ?: systemLabel

    SettingsRow(label = label, detail = detail, onClick = { showDialog = true })

    if (showDialog) {
        InterfaceLanguageDialog(
            selected = selected,
            systemLabel = systemLabel,
            onSelect = {
                onSelect(it)
                showDialog = false
            },
            onDismiss = { showDialog = false },
        )
    }
}

@Composable
private fun InterfaceLanguageDialog(
    selected: String?,
    systemLabel: String,
    onSelect: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_display_language)) },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                LanguageOptionRow(
                    label = systemLabel,
                    isSelected = selected == null,
                    onClick = { onSelect(null) },
                )
                AppLanguage.supportedLanguages.forEach { language ->
                    LanguageOptionRow(
                        label = "${language.flag}  ${language.nativeName}",
                        isSelected = selected == language.code,
                        onClick = { onSelect(language.code) },
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.settings_language_dialog_close))
            }
        },
    )
}

@Composable
private fun LanguageOptionRow(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { role = Role.RadioButton }
            .padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = isSelected, onClick = onClick)
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(text = label, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun DndScheduleRows(
    notifications: UserNotificationPreferences,
    onSetEnabled: (Boolean) -> Unit,
    onSetStart: (Int, Int) -> Unit,
    onSetEnd: (Int, Int) -> Unit,
    onToggleDay: (DndDay) -> Unit,
) {
    NotificationToggleRow(
        label = stringResource(R.string.settings_dnd),
        checked = notifications.dndEnabled,
        enabled = notifications.pushEnabled,
        onCheckedChange = onSetEnabled,
    )
    if (notifications.pushEnabled && notifications.dndEnabled) {
        val active = DndWindow.isActive(notifications, LocalDateTime.now())
        Text(
            text = stringResource(
                if (active) R.string.settings_dnd_active else R.string.settings_dnd_inactive,
            ),
            style = MaterialTheme.typography.bodySmall,
            color = if (active) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        DndTimeRow(
            label = stringResource(R.string.settings_dnd_start),
            timeHhmm = notifications.dndStartTime,
            onPick = onSetStart,
        )
        DndTimeRow(
            label = stringResource(R.string.settings_dnd_end),
            timeHhmm = notifications.dndEndTime,
            onPick = onSetEnd,
        )
        DndDayChips(selected = notifications.dndDays, onToggle = onToggleDay)
    }
}

@Composable
private fun DndTimeRow(
    label: String,
    timeHhmm: String,
    onPick: (Int, Int) -> Unit,
) {
    var showPicker by remember { mutableStateOf(false) }
    val minutes = DndWindow.parseMinuteOfDay(timeHhmm) ?: 0

    SettingsRow(label = label, detail = timeHhmm, onClick = { showPicker = true })

    if (showPicker) {
        DndTimePickerDialog(
            initialHour = minutes / 60,
            initialMinute = minutes % 60,
            onConfirm = { hour, minute ->
                onPick(hour, minute)
                showPicker = false
            },
            onDismiss = { showPicker = false },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DndTimePickerDialog(
    initialHour: Int,
    initialMinute: Int,
    onConfirm: (Int, Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val timeState = rememberTimePickerState(
        initialHour = initialHour,
        initialMinute = initialMinute,
        is24Hour = true,
    )
    AlertDialog(
        onDismissRequest = onDismiss,
        text = { TimePicker(state = timeState) },
        confirmButton = {
            TextButton(onClick = { onConfirm(timeState.hour, timeState.minute) }) {
                Text(stringResource(R.string.settings_dnd_time_picker_confirm))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.settings_dnd_time_picker_dismiss))
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun DndDayChips(
    selected: List<DndDay>,
    onToggle: (DndDay) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(
                if (selected.isEmpty()) R.string.settings_dnd_every_day else R.string.settings_dnd_days,
            ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(MeeshySpacing.xs))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            DndDay.entries.forEach { day ->
                FilterChip(
                    selected = day in selected,
                    onClick = { onToggle(day) },
                    label = { Text(stringResource(dndDayLabelRes(day))) },
                )
            }
        }
    }
}

private fun dndDayLabelRes(day: DndDay): Int = when (day) {
    DndDay.MON -> R.string.settings_dnd_day_mon
    DndDay.TUE -> R.string.settings_dnd_day_tue
    DndDay.WED -> R.string.settings_dnd_day_wed
    DndDay.THU -> R.string.settings_dnd_day_thu
    DndDay.FRI -> R.string.settings_dnd_day_fri
    DndDay.SAT -> R.string.settings_dnd_day_sat
    DndDay.SUN -> R.string.settings_dnd_day_sun
}

@Composable
private fun NotificationTypesEditor(
    notifications: UserNotificationPreferences,
    query: String,
    onQueryChange: (String) -> Unit,
    onToggleType: (NotificationType, Boolean) -> Unit,
) {
    val labels: Map<NotificationType, String> =
        NotificationType.entries.associateWith { stringResource(notificationTypeLabelRes(it)) }
    val sections = NotificationTypeCatalog.sections(
        prefs = notifications,
        query = query,
        label = { labels.getValue(it) },
    )

    Text(
        text = stringResource(R.string.settings_notification_types_title),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    )
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        singleLine = true,
        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
        placeholder = { Text(stringResource(R.string.settings_notification_types_search)) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    )
    if (sections.isEmpty()) {
        Text(
            text = stringResource(R.string.settings_notification_types_empty),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        return
    }
    sections.forEach { section ->
        Text(
            text = stringResource(notificationCategoryLabelRes(section.category)),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        section.items.forEach { item ->
            NotificationToggleRow(
                label = labels.getValue(item.type),
                checked = item.enabled,
                enabled = notifications.pushEnabled,
                onCheckedChange = { onToggleType(item.type, it) },
            )
        }
    }
}

private fun notificationCategoryLabelRes(category: NotificationCategory): Int = when (category) {
    NotificationCategory.MESSAGES -> R.string.settings_notif_cat_messages
    NotificationCategory.CALLS -> R.string.settings_notif_cat_calls
    NotificationCategory.SOCIAL -> R.string.settings_notif_cat_social
    NotificationCategory.GROUPS -> R.string.settings_notif_cat_groups
    NotificationCategory.SYSTEM -> R.string.settings_notif_cat_system
}

private fun notificationTypeLabelRes(type: NotificationType): Int = when (type) {
    NotificationType.REPLY -> R.string.settings_notif_type_reply
    NotificationType.MENTION -> R.string.settings_notif_type_mention
    NotificationType.REACTION -> R.string.settings_notif_type_reaction
    NotificationType.CONVERSATION -> R.string.settings_notif_type_conversation
    NotificationType.MISSED_CALL -> R.string.settings_notif_type_missed_call
    NotificationType.VOICEMAIL -> R.string.settings_notif_type_voicemail
    NotificationType.POST_LIKE -> R.string.settings_notif_type_post_like
    NotificationType.POST_COMMENT -> R.string.settings_notif_type_post_comment
    NotificationType.POST_REPOST -> R.string.settings_notif_type_post_repost
    NotificationType.STORY_REACTION -> R.string.settings_notif_type_story_reaction
    NotificationType.COMMENT_REPLY -> R.string.settings_notif_type_comment_reply
    NotificationType.COMMENT_LIKE -> R.string.settings_notif_type_comment_like
    NotificationType.CONTACT_REQUEST -> R.string.settings_notif_type_contact_request
    NotificationType.GROUP_INVITE -> R.string.settings_notif_type_group_invite
    NotificationType.MEMBER_JOINED -> R.string.settings_notif_type_member_joined
    NotificationType.MEMBER_LEFT -> R.string.settings_notif_type_member_left
    NotificationType.SYSTEM -> R.string.settings_notif_type_system
}

@Composable
private fun NotificationToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (enabled) {
                MaterialTheme.colorScheme.onSurface
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onCheckedChange,
        )
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        content()
        Spacer(Modifier.height(MeeshySpacing.sm))
    }
}

@Composable
private fun SettingsRow(
    label: String,
    detail: String?,
    onClick: (() -> Unit)?,
    labelColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurface,
) {
    val modifier = if (onClick != null) {
        Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(horizontal = MeeshySpacing.lg, vertical = 14.dp)
    } else {
        Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = 14.dp)
    }

    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = labelColor,
            modifier = Modifier.weight(1f),
        )
        if (detail != null) {
            Text(
                text = detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.width(MeeshySpacing.xs))
        }
        if (onClick != null) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowForwardIos,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}
