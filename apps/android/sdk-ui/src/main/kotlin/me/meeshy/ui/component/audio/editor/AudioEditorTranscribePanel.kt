package me.meeshy.ui.component.audio.editor

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
import me.meeshy.sdk.model.audioedit.AudioTranscriptionFailure
import me.meeshy.sdk.model.audioedit.AudioTranscriptionLanguages
import me.meeshy.sdk.model.audioedit.AudioTranscriptionState
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** Les langues d'interface de l'application : celles qu'on propose pour transcrire, chacune nommée dans sa langue. */
internal val TRANSCRIPTION_LANGUAGES = AudioTranscriptionLanguages.CODES

/**
 * Le panneau « Transcrire » — miroir de `transcribePanel` (iOS) : bande de langues, bouton (ou progression
 * pendant la reconnaissance), puis le texte obtenu ou la raison de l'échec. Aucun état ne tient par la seule couleur.
 */
@Composable
internal fun AudioEditorTranscribePanel(
    state: AudioTranscriptionState,
    language: String,
    accent: Color,
    onLanguage: (String) -> Unit,
    onTranscribe: () -> Unit,
) {
    LanguageStrip(language, onLanguage)
    TranscribeAction(state, accent, onTranscribe)
    TranscribeResult(state)
}

@Composable
private fun LanguageStrip(selected: String, onLanguage: (String) -> Unit) {
    val tokens = LocalMeeshyTokens.current
    val haptics = rememberMeeshyHaptics()
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        TRANSCRIPTION_LANGUAGES.forEach { code ->
            val active = code == selected
            Text(
                languageName(code),
                Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(if (active) MeeshyGradients.brand else SolidColor(tokens.textPrimary.copy(alpha = 0.06f)))
                    .semantics { role = Role.RadioButton; this.selected = active }
                    .clickable { haptics.light(); onLanguage(code) }
                    .heightIn(min = 48.dp)
                    .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.smPlus),
                color = if (active) Color.White else tokens.textSecondary,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun TranscribeAction(state: AudioTranscriptionState, accent: Color, onTranscribe: () -> Unit) {
    val tokens = LocalMeeshyTokens.current
    val haptics = rememberMeeshyHaptics()
    if (state.isRunning) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            CircularProgressIndicator(Modifier.size(18.dp), color = accent, strokeWidth = 2.dp)
            Text(stringResource(R.string.audio_editor_transcription_running), color = tokens.textMuted, fontSize = 12.sp)
        }
        return
    }
    val label = stringResource(if (state.offersRetry) R.string.audio_editor_transcription_retry else R.string.audio_editor_transcription_start)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.smPlus))
            .border(1.dp, accent.copy(alpha = 0.35f), RoundedCornerShape(MeeshyRadius.smPlus))
            .semantics { role = Role.Button }
            .clickable { haptics.medium(); onTranscribe() }
            .heightIn(min = 48.dp)
            .padding(vertical = MeeshySpacing.smPlus),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.Waveform, null, Modifier.size(16.dp), tint = accent)
        Text(label, Modifier.padding(start = MeeshySpacing.xsPlus), color = accent, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun TranscribeResult(state: AudioTranscriptionState) {
    val tokens = LocalMeeshyTokens.current
    when (state) {
        is AudioTranscriptionState.Done -> Text(
            state.text,
            Modifier.fillMaxWidth().heightIn(max = 110.dp).verticalScroll(rememberScrollState()),
            color = tokens.textPrimary.copy(alpha = 0.85f),
            fontSize = 15.sp,
        )
        is AudioTranscriptionState.Failed -> Notice(MeeshyIcons.WarningFilled, stringResource(state.reason.messageRes()), MeeshyPalette.Warning)
        AudioTranscriptionState.PermissionDenied ->
            Notice(MeeshyIcons.Lock, stringResource(R.string.audio_editor_transcription_denied), MeeshyPalette.Error)
        AudioTranscriptionState.Idle, AudioTranscriptionState.Running -> Unit
    }
}

@Composable
private fun Notice(icon: ImageVector, text: String, tint: Color) {
    val tokens = LocalMeeshyTokens.current
    Row(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(14.dp), tint = tint)
        Text(text, Modifier.weight(1f), color = tokens.textSecondary, fontSize = 13.sp, textAlign = TextAlign.Start)
    }
}

private fun AudioTranscriptionFailure.messageRes(): Int = when (this) {
    AudioTranscriptionFailure.FILE_MISSING -> R.string.audio_editor_transcription_filemissing
    AudioTranscriptionFailure.EMPTY -> R.string.audio_editor_transcription_empty
    AudioTranscriptionFailure.NO_SPEECH -> R.string.audio_editor_transcription_nospeech
    AudioTranscriptionFailure.FAILED -> R.string.audio_editor_transcription_failed
}

/** Le nom d'une langue dans sa propre langue, comme `nativeName` d'iOS. */
internal fun languageName(code: String): String =
    Locale(code).let { it.getDisplayLanguage(it).replaceFirstChar { c -> c.titlecase(it) } }
