package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ConversationSettingsForm
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.SlowModeOptions
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Admin conversation-settings bottom sheet (feature-parity §Chat — conversation
 * moderation). Presented from the chat header for moderator+ viewers. Every rule
 * (dirty-diff, minimal patch, save lifecycle) lives in the tested
 * [ConversationSettingsViewModel] + [ConversationSettingsForm], so this is
 * coverage-exempt Compose glue: a write-role radio list, an announcement switch, a
 * slow-mode interval picker, an auto-translate switch, and a save button.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationSettingsSheet(
    conversationId: String,
    accentColor: Color,
    onDismiss: () -> Unit,
    viewModel: ConversationSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    LaunchedEffect(conversationId) { viewModel.load(conversationId) }
    LaunchedEffect(state.justSaved) {
        if (state.justSaved) {
            Toast.makeText(
                context,
                context.getString(R.string.conversation_settings_saved),
                Toast.LENGTH_SHORT,
            ).show()
            onDismiss()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                stringResource(R.string.conversation_settings_title),
                style = MaterialTheme.typography.titleSmall,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(vertical = MeeshySpacing.sm),
            )

            val form = state.form
            if (form == null) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .size(24.dp)
                        .padding(vertical = MeeshySpacing.lg),
                    color = accentColor,
                )
                return@Column
            }

            SectionLabel(stringResource(R.string.conversation_settings_write_role))
            MemberRole.entries.forEach { role ->
                SettingRadioRow(
                    label = writeRoleLabel(role),
                    selected = role == form.writeRole,
                    accentColor = accentColor,
                    onClick = { viewModel.setWriteRole(role) },
                )
            }

            SwitchRow(
                label = stringResource(R.string.conversation_settings_announcement),
                checked = form.isAnnouncementChannel,
                accentColor = accentColor,
                onCheckedChange = viewModel::setAnnouncement,
            )

            SectionLabel(stringResource(R.string.conversation_settings_slow_mode))
            SlowModeOptions.SECONDS.forEach { seconds ->
                SettingRadioRow(
                    label = slowModeLabel(seconds),
                    selected = seconds == form.slowModeSeconds,
                    accentColor = accentColor,
                    onClick = { viewModel.setSlowMode(seconds) },
                )
            }

            SwitchRow(
                label = stringResource(R.string.conversation_settings_auto_translate),
                checked = form.autoTranslateEnabled,
                accentColor = accentColor,
                onCheckedChange = viewModel::setAutoTranslate,
            )

            if (state.hasError) {
                Text(
                    stringResource(R.string.conversation_settings_error),
                    color = MeeshyPalette.Error,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = MeeshySpacing.sm),
                    textAlign = TextAlign.Center,
                )
            }

            Button(
                onClick = viewModel::save,
                enabled = state.canSave,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MeeshySpacing.md),
                colors = ButtonDefaults.buttonColors(containerColor = accentColor),
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .size(18.dp)
                            .padding(end = MeeshySpacing.sm),
                        strokeWidth = 2.dp,
                        color = MeeshyPalette.White,
                    )
                }
                Text(stringResource(R.string.conversation_settings_save))
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MeeshyTheme.tokens.textSecondary,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = MeeshySpacing.md),
    )
}

@Composable
private fun SettingRadioRow(
    label: String,
    selected: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            imageVector = if (selected) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked,
            contentDescription = null,
            tint = if (selected) accentColor else MeeshyTheme.tokens.textSecondary,
        )
        Text(label, color = MeeshyTheme.tokens.textPrimary)
    }
}

@Composable
private fun SwitchRow(
    label: String,
    checked: Boolean,
    accentColor: Color,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = MeeshyTheme.tokens.textPrimary)
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(checkedTrackColor = accentColor),
        )
    }
}

@Composable
private fun writeRoleLabel(role: MemberRole): String = stringResource(
    when (role) {
        MemberRole.CREATOR -> R.string.conversation_settings_role_creator
        MemberRole.ADMIN -> R.string.conversation_settings_role_admin
        MemberRole.MODERATOR -> R.string.conversation_settings_role_moderator
        MemberRole.MEMBER -> R.string.conversation_settings_role_member
    },
)

@Composable
private fun slowModeLabel(seconds: Int): String =
    if (seconds == 0) {
        stringResource(R.string.conversation_settings_slow_mode_off)
    } else {
        stringResource(R.string.conversation_settings_slow_mode_seconds, seconds)
    }
