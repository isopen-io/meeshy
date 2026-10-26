package me.meeshy.app.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.LocalDateTime
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.DndDay
import me.meeshy.sdk.model.DndWindow
import me.meeshy.sdk.model.NotificationCategory
import me.meeshy.sdk.model.NotificationType
import me.meeshy.sdk.model.NotificationTypeCatalog
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Plus d'options » des notifications (iOS `NotificationSettingsView`) : e-mail, aperçu,
 * nom de l'expéditeur, groupement, pastille, ne pas déranger et types d'événements. Les trois
 * interrupteurs de tête (push, sons, vibrations) restent sur l'écran Réglages, comme sur iOS.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationSettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
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
    AnimatedVisibility(
        visible = notifications.pushEnabled && notifications.dndEnabled,
        enter = expandVertically() + fadeIn(),
        exit = shrinkVertically() + fadeOut(),
    ) {
        Column {
            val active = DndWindow.isActive(notifications, LocalDateTime.now())
            Text(
                text = stringResource(
                    if (active) R.string.settings_dnd_active else R.string.settings_dnd_inactive,
                ),
                style = MaterialTheme.typography.bodySmall,
                color = if (active) {
                    MeeshyPalette.Indigo500
                } else {
                    MeeshyTheme.tokens.textSecondary
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
}

@Composable
private fun DndTimeRow(
    label: String,
    timeHhmm: String,
    onPick: (Int, Int) -> Unit,
) {
    var showPicker by remember { mutableStateOf(false) }
    val minutes = DndWindow.parseMinuteOfDay(timeHhmm) ?: 0

    SettingsChevronRow(
        icon = Icons.Filled.Schedule,
        title = label,
        color = MeeshyPalette.Indigo500,
        value = timeHhmm,
        onClick = { showPicker = true },
    )

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
            color = MeeshyTheme.tokens.textSecondary,
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
        color = MeeshyTheme.tokens.textSecondary,
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
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        return
    }
    sections.forEach { section ->
        Text(
            text = stringResource(notificationCategoryLabelRes(section.category)),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = MeeshyPalette.Indigo500,
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
    NotificationType.INCOMING_CALL -> R.string.settings_notif_type_incoming_call
    NotificationType.MISSED_CALL -> R.string.settings_notif_type_missed_call
    NotificationType.VOICEMAIL -> R.string.settings_notif_type_voicemail
    NotificationType.POST_LIKE -> R.string.settings_notif_type_post_like
    NotificationType.POST_COMMENT -> R.string.settings_notif_type_post_comment
    NotificationType.POST_REPOST -> R.string.settings_notif_type_post_repost
    NotificationType.STORY_REACTION -> R.string.settings_notif_type_story_reaction
    NotificationType.COMMENT_REPLY -> R.string.settings_notif_type_comment_reply
    NotificationType.COMMENT_LIKE -> R.string.settings_notif_type_comment_like
    NotificationType.FRIEND_CONTENT -> R.string.settings_notif_type_friend_content
    NotificationType.GAME -> R.string.settings_notif_type_game
    NotificationType.CONTACT_ACTIVITY -> R.string.settings_notif_type_contact_activity
    NotificationType.CONTACT_REQUEST -> R.string.settings_notif_type_contact_request
    NotificationType.GROUP_INVITE -> R.string.settings_notif_type_group_invite
    NotificationType.MEMBER_JOINED -> R.string.settings_notif_type_member_joined
    NotificationType.MEMBER_LEFT -> R.string.settings_notif_type_member_left
    NotificationType.SYSTEM -> R.string.settings_notif_type_system
}

