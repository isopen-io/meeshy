package me.meeshy.ui.component.voiceprofile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File
import kotlin.random.Random
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.audio.MediaRecorderEngine
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.voice.VoiceProfilePrompts
import me.meeshy.sdk.model.voice.VoiceSample
import me.meeshy.sdk.model.voice.VoiceSampleRules
import me.meeshy.sdk.model.voice.VoiceSampleSet
import me.meeshy.sdk.model.waveform.AudioRecordingSettings
import me.meeshy.sdk.recording.AudioRecordingProviding
import me.meeshy.sdk.recording.AudioRecordingResult
import me.meeshy.sdk.recording.DefaultAudioRecorder
import me.meeshy.ui.R
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val WAVEFORM_BARS = 15
private const val TICK_MILLIS = 100L
private const val TICK_SECONDS = 0.1

/**
 * L'écran de capture des échantillons du clonage de voix (iOS `VoiceRecordingView`) : un texte à lire à
 * voix haute, la langue PARLÉE (choisissable tant qu'aucun échantillon n'existe, indépendante de la langue
 * et du sens de l'interface), le micro, la liste des échantillons et « Créer le profil vocal ».
 *
 * Un échantillon de moins de [minimumDurationSeconds] est rejeté ; le bouton de création n'est actif qu'à
 * partir de [minimumSamples]. Les échantillons (octets + durée) sont remis à [onSamplesReady]. L'accent est
 * un paramètre de l'appelant. [newRecorder] injecte l'enregistreur (préréglage échantillon, 96 kb/s) ;
 * [readDispatcher] porte la lecture du fichier d'une prise (E/S par défaut).
 */
@Composable
public fun VoiceRecordingView(
    onSamplesReady: (List<VoiceSample>) -> Unit,
    modifier: Modifier = Modifier,
    accent: Color = MeeshyPalette.Indigo500,
    minimumSamples: Int = VoiceSampleRules.MINIMUM_SAMPLES,
    minimumDurationSeconds: Int = VoiceSampleRules.MINIMUM_DURATION_SECONDS,
    initialLanguage: String? = null,
    newRecorder: (() -> AudioRecordingProviding)? = null,
    readDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val permissions = rememberPermissionFlow()
    val recorder = remember { (newRecorder ?: { isolatedSampleRecorder(context) })() }
    var session by remember { mutableStateOf(recorder.session) }
    var samples by remember { mutableStateOf(VoiceSampleSet.empty) }
    var micDenied by remember { mutableStateOf(false) }
    var rejectedShort by remember { mutableStateOf(false) }
    var spokenLanguage by rememberSaveable { mutableStateOf(VoiceProfilePrompts.resolve(initialLanguage)) }
    val rotation = rememberSaveable { Random.nextInt(0, VoiceProfilePrompts.prompts(spokenLanguage).size) }
    val prompt = VoiceProfilePrompts.prompt(spokenLanguage, samples.count, rotation)

    fun accept(result: AudioRecordingResult?) {
        if (result == null || !VoiceSampleRules.isLongEnough(result.durationSeconds, minimumDurationSeconds)) {
            result?.file?.delete()
            rejectedShort = true
            return
        }
        scope.launch {
            val bytes = withContext(readDispatcher) { result.file.runCatching { readBytes().also { delete() } }.getOrNull() }
            if (bytes == null || bytes.isEmpty()) return@launch
            val added = samples.add(bytes, result.durationSeconds, minimumDurationSeconds)
            if (added is VoiceSampleSet.Added.Accepted) samples = added.set
        }
    }

    DisposableEffect(recorder) {
        onDispose { if (recorder.session.isRecording) recorder.cancel() }
    }
    LaunchedEffect(session.isRecording) {
        while (session.isRecording) {
            delay(TICK_MILLIS)
            recorder.tick(TICK_SECONDS)
            session = recorder.session
        }
    }

    fun toggleRecording() {
        if (session.isRecording) {
            recorder.finish(::accept)
            session = recorder.session
            return
        }
        scope.launch {
            if (!permissions.ensure(PermissionNature.MICROPHONE)) {
                micDenied = true
                return@launch
            }
            micDenied = false
            rejectedShort = false
            recorder.start { live ->
                session = recorder.session
                if (live) haptics.light()
            }
        }
    }

    Column(
        modifier = modifier.padding(horizontal = MeeshySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        SampleTextCard(
            prompt = prompt,
            accent = accent,
            position = minOf(samples.count + 1, minimumSamples),
            total = minimumSamples,
            spokenLanguage = spokenLanguage,
            languageLocked = samples.count > 0 || session.isRecording,
            onLanguage = {
                spokenLanguage = it
                haptics.light()
            },
        )
        SamplesList(samples = samples.samples, onRemove = { samples = samples.remove(it) })
        Spacer(Modifier.weight(1f))
        if (micDenied) {
            Text(
                text = stringResource(R.string.media_permission_microphone_denied_message),
                color = MeeshyPalette.TileCoral,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.fillMaxWidth().testTag("voice_mic_denied"),
            )
        }
        if (rejectedShort && !session.isRecording) {
            Text(
                text = stringResource(R.string.voiceProfile_recording_min_duration, minimumDurationSeconds),
                color = MeeshyPalette.TileCoral,
                fontSize = 13.sp,
                modifier = Modifier.fillMaxWidth().testTag("voice_sample_too_short"),
            )
        }
        RecordingControls(
            isRecording = session.isRecording,
            elapsed = session.elapsedSeconds,
            levels = session.levels,
            accent = accent,
            minimumDurationSeconds = minimumDurationSeconds,
            onToggle = ::toggleRecording,
        )
        CreateProfileButton(
            enabled = VoiceSampleRules.canCreateProfile(samples.count, minimumSamples),
            accent = accent,
            onClick = {
                haptics.light()
                onSamplesReady(samples.samples)
            },
        )
    }
    PermissionFlowHost(permissions, accent = accent)
}

@Composable
private fun SampleTextCard(
    prompt: VoiceProfilePrompts.Prompt?,
    accent: Color,
    position: Int,
    total: Int,
    spokenLanguage: String,
    languageLocked: Boolean,
    onLanguage: (String) -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Icon(MeeshyIcons.Quote, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
            Text(
                text = stringResource(R.string.voiceProfile_recording_readAloud),
                color = tokens.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "$position/$total",
                color = accent,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
            )
        }
        if (prompt != null) {
            val direction = if (prompt.isRightToLeft) LayoutDirection.Rtl else LayoutDirection.Ltr
            androidx.compose.runtime.CompositionLocalProvider(LocalLayoutDirection provides direction) {
                Text(
                    text = prompt.text,
                    color = tokens.textPrimary,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(MeeshyRadius.smPlus))
                        .background(accent.copy(alpha = 0.06f))
                        .padding(MeeshySpacing.md)
                        .testTag("voice_prompt_text"),
                )
            }
        }
        LanguageChips(selected = spokenLanguage, locked = languageLocked, accent = accent, onSelect = onLanguage)
    }
}

@Composable
private fun LanguageChips(selected: String, locked: Boolean, accent: Color, onSelect: (String) -> Unit) {
    val label = stringResource(R.string.voiceProfile_recording_languagePicker)
    Row(
        modifier = Modifier
            .horizontalScroll(rememberScrollState())
            .semantics { contentDescription = label }
            .testTag("voice_language_picker"),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        VoiceProfilePrompts.supportedLanguageCodes.forEach { code ->
            val info = LanguageData.info(code)
            val isSelected = code == selected
            Box(
                modifier = Modifier
                    .height(48.dp)
                    .clip(CircleShape)
                    .background(accent.copy(alpha = if (isSelected) 0.14f else 0.05f))
                    .clickable(enabled = !locked) { onSelect(code) }
                    .padding(horizontal = MeeshySpacing.md)
                    .semantics {
                        role = Role.Button
                        this.selected = isSelected
                        if (locked) disabled()
                    }
                    .testTag("voice_language_$code"),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "${info?.flag.orEmpty()} ${info?.nativeName ?: code.uppercase()}".trim(),
                    color = if (isSelected) accent else MeeshyTheme.tokens.textSecondary,
                    fontSize = 13.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                )
            }
        }
    }
}

@Composable
private fun RecordingControls(
    isRecording: Boolean,
    elapsed: Double,
    levels: List<Float>,
    accent: Color,
    minimumDurationSeconds: Int,
    onToggle: () -> Unit,
) {
    val tint = if (isRecording) MeeshyPalette.TileCoral else accent
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md), horizontalAlignment = Alignment.CenterHorizontally) {
        if (isRecording) Waveform(levels = levels, accent = accent)
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Box(Modifier.weight(1f)) {
                if (isRecording) {
                    Text(
                        text = formatDuration(elapsed),
                        color = MeeshyPalette.TileCoral,
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.testTag("voice_elapsed"),
                    )
                }
            }
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(tint)
                    .clickable(onClick = onToggle)
                    .semantics { role = Role.Button }
                    .testTag("voice_record_button"),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (isRecording) MeeshyIcons.Stop else MeeshyIcons.Mic,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(24.dp),
                )
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                if (isRecording) {
                    Text(
                        text = stringResource(R.string.voiceProfile_recording_min_duration, minimumDurationSeconds),
                        color = MeeshyTheme.tokens.textSecondary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
private fun Waveform(levels: List<Float>, accent: Color) {
    val window = levels.takeLast(WAVEFORM_BARS)
    Row(
        modifier = Modifier.height(38.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(WAVEFORM_BARS) { index ->
            val level = window.getOrNull(index - (WAVEFORM_BARS - window.size))?.coerceIn(0f, 1f) ?: 0f
            Box(
                Modifier
                    .width(4.dp)
                    .height((8 + 30 * level).dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(accent.copy(alpha = 0.6f)),
            )
        }
    }
}

@Composable
private fun SamplesList(samples: List<VoiceSample>, onRemove: (Long) -> Unit) {
    val tokens = MeeshyTheme.tokens
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        samples.forEachIndexed { index, sample ->
            val number = index + 1
            val deleteLabel = stringResource(R.string.voice_prompts_delete_sample, number)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(tokens.backgroundSecondary)
                    .padding(start = MeeshySpacing.md)
                    .testTag("voice_sample_$number"),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
            ) {
                Icon(MeeshyIcons.CheckCircleFilled, contentDescription = null, tint = tokens.success, modifier = Modifier.size(20.dp))
                Text(
                    text = stringResource(R.string.voiceProfile_recording_sample, number),
                    color = tokens.textPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = formatDuration(sample.durationSeconds),
                    color = tokens.textSecondary,
                    fontSize = 13.sp,
                    fontFamily = FontFamily.Monospace,
                )
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clickable { onRemove(sample.id) }
                        .semantics {
                            role = Role.Button
                            contentDescription = deleteLabel
                        }
                        .testTag("voice_sample_delete_$number"),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(MeeshyIcons.Close, contentDescription = null, tint = MeeshyPalette.TileCoral.copy(alpha = 0.7f), modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

@Composable
private fun CreateProfileButton(enabled: Boolean, accent: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(if (enabled) accent else MeeshyTheme.tokens.backgroundTertiary)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = MeeshySpacing.mdPlus)
            .semantics {
                role = Role.Button
                if (!enabled) disabled()
            }
            .testTag("voice_create_profile"),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.Forward, contentDescription = null, tint = if (enabled) Color.White else MeeshyTheme.tokens.textMuted, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.voiceProfile_recording_createProfile),
            color = if (enabled) Color.White else MeeshyTheme.tokens.textMuted,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun formatDuration(seconds: Double): String {
    val total = seconds.toInt()
    return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
}

/** L'enregistreur par défaut, réglé sur le préréglage échantillon (96 kb/s) ; l'hôte injecte celui de `AudioRecorderFactory` (session et garde d'appel partagées). */
private fun isolatedSampleRecorder(context: android.content.Context): AudioRecordingProviding {
    val app = context.applicationContext
    return DefaultAudioRecorder(
        settings = AudioRecordingSettings.voiceSample,
        directory = File(app.cacheDir, "voice"),
        engineFactory = { MediaRecorderEngine(app, it.profile) },
    )
}
