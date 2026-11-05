package me.meeshy.app.settings

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.text.NumberFormat
import java.util.Locale
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.VoiceProfile
import me.meeshy.sdk.model.VoiceProfileStatus
import me.meeshy.ui.component.chrome.CollapsibleHeaderPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Profil vocal » (iOS `VoiceProfileManageView`) : l'état du profil existant, le clonage de la voix et la transcription
 * automatique, puis la suppression RGPD. Sans profil, l'écran propose de le créer ; ouvert par un indicateur de
 * consentement vocal ([openWizardWhenEmpty]), il cède aussitôt la place à l'assistant. Le profil est relu à chaque
 * retour au premier plan (l'assistant vient peut-être de le créer), sans repasser par le chargement.
 */
@Composable
fun VoiceProfileManageScreen(
    onClose: () -> Unit,
    onCreate: () -> Unit,
    openWizardWhenEmpty: Boolean = false,
    viewModel: VoiceProfileManageViewModel = hiltViewModel(),
    transcription: TranscriptionSettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val autoTranscribe by transcription.autoTranscribeIncoming.collectAsStateWithLifecycle()
    var resumed by rememberSaveable { mutableStateOf(false) }
    LifecycleResumeEffect(viewModel) {
        if (resumed) viewModel.reload() else resumed = true
        onPauseOrDispose { }
    }
    var wizardOpened by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(state.phase, openWizardWhenEmpty) {
        if (openWizardWhenEmpty && !wizardOpened && state.phase == VoiceProfileManagePhase.Empty) {
            wizardOpened = true
            onCreate()
        }
    }
    VoiceProfileErrorToast(state.error, viewModel::dismissError)
    VoiceProfileManageContent(
        state = state,
        autoTranscribe = autoTranscribe,
        onClose = onClose,
        onCreate = onCreate,
        onRetry = viewModel::reload,
        onCloningChange = viewModel::setCloningEnabled,
        onAutoTranscribeChange = transcription::setAutoTranscribeIncoming,
        onDelete = viewModel::deleteProfile,
    )
}

/** Le contenu sans état de l'écran : ce que les témoins Compose montent directement. */
@Composable
internal fun VoiceProfileManageContent(
    state: VoiceProfileManageUiState,
    autoTranscribe: Boolean,
    onClose: () -> Unit,
    onCreate: () -> Unit,
    onRetry: () -> Unit,
    onCloningChange: (Boolean) -> Unit,
    onAutoTranscribeChange: (Boolean) -> Unit,
    onDelete: () -> Unit,
) {
    MeeshyBackground {
        CollapsibleHeaderPage(
            title = stringResource(R.string.voice_profile_title),
            onBack = onClose,
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
            ) {
                when (val phase = state.phase) {
                    VoiceProfileManagePhase.Loading -> CenteredProgress()
                    VoiceProfileManagePhase.Failed -> LoadFailed(onRetry)
                    VoiceProfileManagePhase.Empty -> EmptyProfile(onCreate)
                    is VoiceProfileManagePhase.Loaded -> LoadedProfile(
                        profile = phase.profile,
                        state = state,
                        autoTranscribe = autoTranscribe,
                        onCloningChange = onCloningChange,
                        onAutoTranscribeChange = onAutoTranscribeChange,
                        onDelete = onDelete,
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadedProfile(
    profile: VoiceProfile,
    state: VoiceProfileManageUiState,
    autoTranscribe: Boolean,
    onCloningChange: (Boolean) -> Unit,
    onAutoTranscribeChange: (Boolean) -> Unit,
    onDelete: () -> Unit,
) {
    val tint = MeeshyPalette.TrackingAccent
    var confirmingDelete by rememberSaveable { mutableStateOf(false) }
    SettingsGroup(statusLabel(profile.status), MeeshyIcons.WaveformMic, tint) {
        SettingsRow(icon = MeeshyIcons.Info, title = statusDescription(profile.status), color = tint)
        profile.quality?.let { quality ->
            SettingsSeparator(tint)
            SettingsRow(
                icon = MeeshyIcons.Sparkles,
                title = stringResource(R.string.voice_profile_quality),
                color = tint,
                value = NumberFormat.getPercentInstance().format(quality),
            )
        }
        SettingsSeparator(tint)
        SettingsRow(
            icon = MeeshyIcons.Waveform,
            title = stringResource(R.string.voice_profile_samples),
            color = tint,
            value = profile.sampleCount.toString(),
        )
        SettingsSeparator(tint)
        SettingsRow(
            icon = MeeshyIcons.Timer,
            title = stringResource(R.string.voice_profile_total_duration),
            color = tint,
            value = clockLabel(profile.totalDurationSeconds),
        )
    }
    SettingsGroup(stringResource(R.string.voice_profile_cloning_enabled), MeeshyIcons.RecordVoice, tint) {
        NotificationToggleRow(
            label = stringResource(R.string.voice_profile_cloning_enabled),
            subtitle = stringResource(R.string.voice_profile_cloning_description),
            checked = state.isCloningEnabled,
            onCheckedChange = onCloningChange,
            icon = MeeshyIcons.RecordVoice,
            color = tint,
        )
        SettingsSeparator(tint)
        NotificationToggleRow(
            label = stringResource(R.string.settings_transcription_auto),
            checked = autoTranscribe,
            onCheckedChange = onAutoTranscribeChange,
            icon = MeeshyIcons.Quote,
            color = MeeshyPalette.Indigo300,
        )
    }
    SettingsGroup(stringResource(R.string.voice_profile_delete_profile), MeeshyIcons.Delete, MeeshyPalette.Error) {
        SettingsRow(
            icon = MeeshyIcons.Delete,
            title = stringResource(R.string.voice_profile_delete_profile),
            color = MeeshyPalette.Error,
            modifier = Modifier.clickable(enabled = !state.isDeleting, role = Role.Button) { confirmingDelete = true },
        )
    }
    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text(stringResource(R.string.voice_profile_delete_alert_title)) },
            text = { Text(stringResource(R.string.voice_profile_delete_alert_message)) },
            confirmButton = {
                TextButton(onClick = { confirmingDelete = false; onDelete() }) {
                    Text(stringResource(R.string.common_delete), color = MeeshyPalette.Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) { Text(stringResource(R.string.common_cancel)) }
            },
        )
    }
}

@Composable
private fun EmptyProfile(onCreate: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.voice_profile_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.voice_profile_empty_description),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onCreate,
            colors = ButtonDefaults.buttonColors(containerColor = MeeshyPalette.TrackingAccent, contentColor = Color.White),
        ) {
            Text(stringResource(R.string.voice_profile_create))
        }
    }
}

@Composable
private fun LoadFailed(onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.voice_profile_error_load),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.voice_profile_retry)) }
    }
}

@Composable
private fun CenteredProgress() {
    Box(Modifier.fillMaxWidth().padding(top = MeeshySpacing.xl), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MeeshyPalette.TrackingAccent)
    }
}

@Composable
private fun VoiceProfileErrorToast(error: VoiceProfileManageError?, onShown: () -> Unit) {
    val context = LocalContext.current
    val message = when (error) {
        VoiceProfileManageError.CLONING -> stringResource(R.string.voice_profile_error_cloning)
        VoiceProfileManageError.DELETE -> stringResource(R.string.voice_profile_error_delete_profile)
        null -> null
    }
    LaunchedEffect(message) {
        if (message == null) return@LaunchedEffect
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        onShown()
    }
}

@Composable
private fun statusLabel(status: VoiceProfileStatus): String = stringResource(
    if (status == VoiceProfileStatus.EXPIRED) R.string.voice_profile_status_expired_label else R.string.voice_profile_status_ready_label,
)

@Composable
private fun statusDescription(status: VoiceProfileStatus): String = stringResource(
    if (status == VoiceProfileStatus.EXPIRED) R.string.voice_profile_status_expired_description else R.string.voice_profile_status_ready_description,
)

internal fun clockLabel(totalSeconds: Int): String = String.format(Locale.ROOT, "%d:%02d", totalSeconds / 60, totalSeconds % 60)
