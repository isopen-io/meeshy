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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import java.time.LocalDateTime
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.DndDay
import me.meeshy.sdk.model.DndWindow
import me.meeshy.sdk.model.UserNotificationPreferences
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Plage Ne pas déranger : interrupteur, état actif, heures de début et de fin, jours. */
@Composable
internal fun DndScheduleRows(
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
        icon = MeeshyIcons.ScheduleFilled,
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
