package me.meeshy.ui.component.voiceprofile

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import me.meeshy.sdk.model.VoiceProfile
import me.meeshy.sdk.model.VoiceProfileStatus
import me.meeshy.sdk.model.voice.VoiceSample
import me.meeshy.sdk.model.voice.VoiceWizardError
import me.meeshy.sdk.model.voice.VoiceWizardRules
import me.meeshy.sdk.model.voice.VoiceWizardState
import me.meeshy.sdk.model.voice.VoiceWizardStep
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

public const val VOICE_WIZARD_PROGRESS_TAG: String = "voice_wizard_progress"
public const val VOICE_WIZARD_CLOSE_TAG: String = "voice_wizard_close"
public const val VOICE_WIZARD_CONSENT_TOGGLE_TAG: String = "voice_wizard_consent_toggle"
public const val VOICE_WIZARD_CONSENT_CONTINUE_TAG: String = "voice_wizard_consent_continue"
public const val VOICE_WIZARD_AGE_VERIFY_TAG: String = "voice_wizard_age_verify"
public const val VOICE_WIZARD_FINISH_TAG: String = "voice_wizard_finish"
public const val VOICE_WIZARD_ERROR_TAG: String = "voice_wizard_error"

private val SEGMENT_HEIGHT = 3.dp
private val PROGRESS_MAX_WIDTH = 200.dp
private val COMPLETE_ICON_SIZE = 60.dp
private const val PROCESSING_SPINNER_SCALE = 1.5f
private val MIN_TARGET = 48.dp

/** Le titre de chaque étape : c'est lui que TalkBack annonce quand l'étape change (iOS `stepAnnouncement`). */
@StringRes
public fun voiceWizardStepTitle(step: VoiceWizardStep): Int = when (step) {
    VoiceWizardStep.CONSENT -> R.string.voiceProfile_wizard_title
    VoiceWizardStep.AGE_VERIFICATION -> R.string.voiceProfile_age_title
    VoiceWizardStep.RECORDING -> R.string.voiceProfile_recording_title
    VoiceWizardStep.PROCESSING -> R.string.voiceProfile_processing_title
    VoiceWizardStep.COMPLETE -> R.string.voiceProfile_complete_title
}

/**
 * L'assistant de création du profil vocal (iOS `VoiceProfileWizardView`) : barre de progression par segments, puis
 * consentement, âge, enregistrement, traitement et récapitulatif. Écran sans état propre : [state] vient du modèle de
 * vue, chaque geste remonte par un rappel. L'accent est un paramètre de l'appelant ; [recordingContent] reçoit
 * l'écran d'échantillons (par défaut [VoiceRecordingView]).
 */
@Composable
public fun VoiceProfileWizardView(
    state: VoiceWizardState,
    onClose: () -> Unit,
    onConsentChange: (Boolean) -> Unit,
    onContinueFromConsent: () -> Unit,
    onBirthDateChange: (LocalDate) -> Unit,
    onVerifyAge: () -> Unit,
    onSamplesReady: (List<VoiceSample>) -> Unit,
    onErrorDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
    initialLanguage: String? = null,
    recordingContent: @Composable (onSamplesReady: (List<VoiceSample>) -> Unit) -> Unit = { ready ->
        VoiceRecordingView(onSamplesReady = ready, accent = accent, initialLanguage = initialLanguage)
    },
) {
    val tokens = MeeshyTheme.tokens
    Column(modifier = modifier.fillMaxSize().background(tokens.backgroundPrimary)) {
        WizardHeader(step = state.step, accent = accent, onClose = onClose)
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when (state.step) {
                VoiceWizardStep.CONSENT -> ConsentStep(state, accent, onConsentChange, onContinueFromConsent)
                VoiceWizardStep.AGE_VERIFICATION -> AgeStep(state, accent, onBirthDateChange, onVerifyAge)
                VoiceWizardStep.RECORDING -> RecordingStep(recordingContent, onSamplesReady)
                VoiceWizardStep.PROCESSING -> ProcessingStep(state, accent)
                VoiceWizardStep.COMPLETE -> CompleteStep(state.profile, accent, onClose)
            }
        }
    }
    state.error?.let { ErrorAlert(it, accent, onErrorDismiss) }
}

@Composable
private fun WizardHeader(step: VoiceWizardStep, accent: Color, onClose: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val stepTitle = stringResource(voiceWizardStepTitle(step))
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().heightIn(min = MIN_TARGET)) {
            TextButton(
                onClick = onClose,
                modifier = Modifier.align(Alignment.CenterStart).heightIn(min = MIN_TARGET).testTag(VOICE_WIZARD_CLOSE_TAG),
            ) {
                Text(stringResource(R.string.voiceProfile_wizard_close), color = accent, fontWeight = FontWeight.Medium)
            }
            Text(
                text = stringResource(R.string.voiceProfile_wizard_title),
                color = tokens.textPrimary,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.align(Alignment.Center).semantics { heading() },
            )
        }
        StepIndicator(step = step, accent = accent, stepTitle = stepTitle)
    }
}

@Composable
private fun StepIndicator(step: VoiceWizardStep, accent: Color, stepTitle: String) {
    val tokens = MeeshyTheme.tokens
    val total = VoiceWizardStep.entries.size
    Box(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg).padding(top = MeeshySpacing.xs, bottom = MeeshySpacing.sm), contentAlignment = Alignment.Center) {
        Row(
            modifier = Modifier
                .widthIn(max = PROGRESS_MAX_WIDTH)
                .fillMaxWidth()
                .testTag(VOICE_WIZARD_PROGRESS_TAG)
                .clearAndSetSemantics {
                    contentDescription = stepTitle
                    liveRegion = LiveRegionMode.Polite
                    progressBarRangeInfo = ProgressBarRangeInfo((step.ordinal + 1).toFloat(), 1f..total.toFloat(), total - 2)
                },
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            VoiceWizardStep.entries.forEach { segment ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(SEGMENT_HEIGHT)
                        .clip(CircleShape)
                        .background(if (segment.isReached(step)) accent else tokens.textMuted.copy(alpha = 0.2f)),
                )
            }
        }
    }
}

@Composable
private fun PrimaryButton(label: String, accent: Color, enabled: Boolean, tag: String, onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val shape = RoundedCornerShape(MeeshyRadius.md)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = MIN_TARGET)
            .clip(shape)
            .background(if (enabled) accent else tokens.textMuted.copy(alpha = 0.3f))
            .toggleableButton(enabled, onClick)
            .testTag(tag),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(vertical = MeeshySpacing.mdPlus),
        )
    }
}

private fun Modifier.toggleableButton(enabled: Boolean, onClick: () -> Unit): Modifier =
    this.clickable(enabled = enabled, role = Role.Button, onClick = onClick)

@Composable
private fun ConsentStep(state: VoiceWizardState, accent: Color, onConsentChange: (Boolean) -> Unit, onContinue: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
    ) {
        Icon(MeeshyIcons.Waveform, contentDescription = null, tint = accent, modifier = Modifier.size(56.dp))
        Text(stringResource(R.string.voiceProfile_consent_title), color = tokens.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.voiceProfile_consent_description), color = tokens.textSecondary, fontSize = 14.sp, textAlign = TextAlign.Center)
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
            ConsentPoint(MeeshyIcons.Mic, R.string.voiceProfile_consent_point1, accent)
            ConsentPoint(MeeshyIcons.Waveform, R.string.voiceProfile_consent_point2, accent)
            ConsentPoint(MeeshyIcons.Globe, R.string.voiceProfile_consent_point3, accent)
            ConsentPoint(MeeshyIcons.Delete, R.string.voiceProfile_consent_point4, accent)
            ConsentPoint(MeeshyIcons.LockFilled, R.string.voiceProfile_consent_point5, accent)
        }
        val toggleLabel = stringResource(R.string.voiceProfile_consent_toggle)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = MIN_TARGET)
                .toggleable(value = state.consentGiven, role = Role.Switch, onValueChange = onConsentChange)
                .testTag(VOICE_WIZARD_CONSENT_TOGGLE_TAG),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Text(toggleLabel, color = tokens.textPrimary, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Switch(
                checked = state.consentGiven,
                onCheckedChange = null,
                colors = SwitchDefaults.colors(checkedTrackColor = accent),
            )
        }
        PrimaryButton(stringResource(R.string.voiceProfile_consent_continue), accent, state.canContinueFromConsent, VOICE_WIZARD_CONSENT_CONTINUE_TAG, onContinue)
    }
}

@Composable
private fun ConsentPoint(icon: ImageVector, @StringRes text: Int, accent: Color) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(24.dp))
        Text(stringResource(text), color = MeeshyTheme.tokens.textSecondary, fontSize = 13.sp, modifier = Modifier.weight(1f))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AgeStep(state: VoiceWizardState, accent: Color, onBirthDateChange: (LocalDate) -> Unit, onVerify: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val today = remember { LocalDate.now() }
    val pickerState = rememberDatePickerState(
        initialSelectedDateMillis = state.birthDate.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli(),
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean = !VoiceWizardRules.dayFromPicker(utcTimeMillis).isAfter(today)
        },
    )
    LaunchedEffect(pickerState.selectedDateMillis) {
        pickerState.selectedDateMillis?.let { onBirthDateChange(VoiceWizardRules.dayFromPicker(it)) }
    }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Text(stringResource(R.string.voiceProfile_age_title), color = tokens.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.voiceProfile_age_description), color = tokens.textSecondary, fontSize = 14.sp, textAlign = TextAlign.Center)
        DatePicker(state = pickerState, title = null, headline = { Text(stringResource(R.string.voiceProfile_age_birthDate), color = tokens.textSecondary, fontSize = 13.sp) }, showModeToggle = false)
        PrimaryButton(stringResource(R.string.voiceProfile_age_verify), accent, !state.isLoading, VOICE_WIZARD_AGE_VERIFY_TAG, onVerify)
    }
}

@Composable
private fun RecordingStep(content: @Composable (onSamplesReady: (List<VoiceSample>) -> Unit) -> Unit, onSamplesReady: (List<VoiceSample>) -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        Text(stringResource(R.string.voiceProfile_recording_title), color = tokens.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Text(
            stringResource(R.string.voiceProfile_recording_description),
            color = tokens.textSecondary,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = MeeshySpacing.xxl),
        )
        content(onSamplesReady)
    }
}

@Composable
private fun ProcessingStep(state: VoiceWizardState, accent: Color) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = MeeshySpacing.xxxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(color = accent, modifier = Modifier.scale(PROCESSING_SPINNER_SCALE))
        Spacer(Modifier.height(MeeshySpacing.xxl))
        Text(stringResource(R.string.voiceProfile_processing_title), color = tokens.textPrimary, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(MeeshySpacing.lg))
        if (state.totalToUpload > 0) {
            Text(
                text = stringResource(R.string.voiceProfile_wizard_upload_progress, state.uploadedCount, state.totalToUpload),
                color = tokens.textSecondary,
                fontSize = 13.sp,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.testTag("voice_wizard_upload_progress"),
            )
            Spacer(Modifier.height(MeeshySpacing.sm))
            LinearProgressIndicator(progress = { state.uploadFraction }, color = accent, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(MeeshySpacing.lg))
        }
        Text(stringResource(R.string.voiceProfile_processing_description), color = tokens.textMuted, fontSize = 13.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun CompleteStep(profile: VoiceProfile?, accent: Color, onFinish: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = MeeshySpacing.xxl, vertical = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl, Alignment.CenterVertically),
    ) {
        Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = tokens.success, modifier = Modifier.size(COMPLETE_ICON_SIZE).testTag("voice_wizard_complete_icon"))
        Text(stringResource(R.string.voiceProfile_complete_title), color = tokens.textPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        if (profile != null) Recap(profile)
        Text(stringResource(R.string.voiceProfile_complete_description), color = tokens.textSecondary, fontSize = 14.sp, textAlign = TextAlign.Center)
        PrimaryButton(stringResource(R.string.voiceProfile_complete_finish), accent, true, VOICE_WIZARD_FINISH_TAG, onFinish)
    }
}

@Composable
private fun Recap(profile: VoiceProfile) {
    val tokens = MeeshyTheme.tokens
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(tokens.backgroundSecondary)
            .padding(MeeshySpacing.lg)
            .testTag("voice_wizard_recap"),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        RecapRow(stringResource(R.string.voiceProfile_wizard_recap_samples), profile.sampleCount.toString())
        RecapRow(stringResource(R.string.voiceProfile_wizard_recap_duration), "${profile.totalDurationSeconds}s")
        profile.quality?.let { RecapRow(stringResource(R.string.voiceProfile_wizard_recap_quality), "${(it * 100).toInt()}%") }
        RecapRow(stringResource(R.string.voiceProfile_wizard_recap_status), stringResource(statusLabel(profile.status)))
    }
}

@StringRes
private fun statusLabel(status: VoiceProfileStatus): Int = when (status) {
    VoiceProfileStatus.PENDING -> R.string.voiceProfile_wizard_status_pending
    VoiceProfileStatus.PROCESSING -> R.string.voiceProfile_wizard_status_processing
    VoiceProfileStatus.READY -> R.string.voiceProfile_wizard_status_ready
    VoiceProfileStatus.FAILED -> R.string.voiceProfile_wizard_status_failed
    VoiceProfileStatus.EXPIRED -> R.string.voiceProfile_wizard_status_expired
}

@Composable
private fun RecapRow(label: String, value: String) {
    val tokens = MeeshyTheme.tokens
    Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = tokens.textSecondary, fontSize = 13.sp)
        Text(value, color = tokens.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ErrorAlert(error: VoiceWizardError, accent: Color, onDismiss: () -> Unit) {
    val message = when (error) {
        VoiceWizardError.UNDER_AGE -> R.string.voiceProfile_age_tooYoungError
        VoiceWizardError.CONSENT -> R.string.voiceProfile_wizard_error_consent
        VoiceWizardError.UPLOAD -> R.string.voiceProfile_wizard_error_upload
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.voiceProfile_wizard_errorTitle)) },
        text = { Text(stringResource(message), modifier = Modifier.testTag(VOICE_WIZARD_ERROR_TAG)) },
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.voiceProfile_wizard_ok), color = accent) } },
    )
}
