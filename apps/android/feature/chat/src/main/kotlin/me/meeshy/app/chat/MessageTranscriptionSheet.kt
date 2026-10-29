package me.meeshy.app.chat

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.MessageTranscriptionFiche
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.MessageTranscriptionFiche.State
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La fiche « Transcription » d'un message audio ou vidéo (#13779, iOS `MessageTranscriptionDetailView`) : écran mince
 * sur la loi [MessageTranscriptionFiche]. La traduction servie par le Prisme passe en tête, soulignée à l'accent.
 */
@Composable
internal fun MessageTranscriptionSheet(
    messageId: String,
    attachments: List<ApiMessageAttachment>,
    accentColor: Color,
    modifier: Modifier = Modifier,
    viewModel: MessageTranscriptionViewModel = hiltViewModel(),
) {
    DisposableEffect(messageId) {
        viewModel.bind(messageId)
        onDispose { viewModel.unbind() }
    }
    val request by viewModel.request.collectAsStateWithLifecycle()
    val state = MessageTranscriptionFiche.of(attachments, viewModel.preferences, request)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg)
            .padding(bottom = MeeshySpacing.xl),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            stringResource(R.string.chat_action_transcription),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(vertical = MeeshySpacing.sm).semantics { heading() },
        )
        when (state) {
            State.Unavailable -> Unit
            is State.Empty -> TranscriptionEmpty(state, accentColor) { attachmentId -> viewModel.transcribe(messageId, attachmentId) }
            is State.Ready -> TranscriptionReady(state, accentColor)
        }
    }
}

@Composable
private fun TranscriptionReady(state: State.Ready, accentColor: Color) {
    val original = state.original
    val language = original.language?.let { LanguageData.info(it)?.name ?: it }
    val inLanguage = language?.let { stringResource(R.string.transcription_fiche_a11y_in_language, it) }
    val confidence = original.confidencePercent?.let { stringResource(R.string.transcription_fiche_a11y_confidence, it) }
    val bannerLabel = listOfNotNull(inLanguage, confidence, original.durationSeconds?.let(::clock)).joinToString(", ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(accentColor.copy(alpha = 0.06f), RoundedCornerShape(MeeshyRadius.sm))
            .padding(MeeshySpacing.md)
            .clearAndSetSemantics { contentDescription = bannerLabel },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(MeeshyIcons.WaveformMic, contentDescription = null, tint = accentColor, modifier = Modifier.size(18.dp))
        Text(
            language.orEmpty(),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Spacer(Modifier.weight(1f))
        original.confidencePercent?.let { Text(percent(it), style = MaterialTheme.typography.labelSmall, color = accentColor) }
        original.durationSeconds?.let { Text(clock(it), style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted) }
    }
    Text(original.text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
    original.speakerCount?.let { count ->
        Text(
            stringResource(R.string.transcription_fiche_speakers, count),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
    if (state.translations.isNotEmpty()) {
        Text(
            stringResource(R.string.transcription_fiche_translations),
            style = MaterialTheme.typography.labelLarge,
            color = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.padding(top = MeeshySpacing.sm).semantics { heading() },
        )
        state.translations.forEach { TranslationRow(it, accentColor) }
    }
}

@Composable
private fun TranslationRow(translation: MessageTranscriptionFiche.Translation, accentColor: Color) {
    val info = LanguageData.info(translation.language)
    val name = info?.name ?: translation.language
    val clonedLabel = stringResource(R.string.transcription_fiche_a11y_cloned_voice)
    val label = listOfNotNull(name, clonedLabel.takeIf { translation.isCloned }, translation.durationSeconds?.let(::clock), translation.text)
        .joinToString(", ")
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                BorderStroke(if (translation.isServed) 1.5.dp else 0.5.dp, accentColor.copy(alpha = if (translation.isServed) 0.6f else 0.15f)),
                RoundedCornerShape(MeeshyRadius.sm),
            )
            .padding(MeeshySpacing.md)
            .clearAndSetSemantics { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Text(info?.flag ?: translation.language.uppercase(), style = MaterialTheme.typography.labelLarge)
            Text(
                name,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = if (translation.isServed) FontWeight.Bold else FontWeight.SemiBold,
                color = if (translation.isServed) accentColor else MeeshyTheme.tokens.textPrimary,
            )
            Spacer(Modifier.weight(1f))
            if (translation.isCloned) {
                Text(stringResource(R.string.transcription_fiche_cloned), style = MaterialTheme.typography.labelSmall, color = accentColor)
            }
            translation.durationSeconds?.let { Text(clock(it), style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted) }
        }
        Text(translation.text, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary, maxLines = 4)
    }
}

@Composable
private fun TranscriptionEmpty(state: State.Empty, accentColor: Color, onTranscribe: (String) -> Unit) {
    state.media.forEach { media ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshyRadius.sm))
                .padding(MeeshySpacing.md)
                .semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(if (media.isVideo) MeeshyIcons.Video else MeeshyIcons.Waveform, contentDescription = null, tint = accentColor, modifier = Modifier.size(20.dp))
            Column(Modifier.weight(1f)) {
                media.name?.let { Text(it, style = MaterialTheme.typography.labelLarge, color = MeeshyTheme.tokens.textPrimary, maxLines = 1) }
                media.durationSeconds?.let { Text(clock(it), style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted) }
            }
        }
    }
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(MeeshyIcons.TextFields, contentDescription = null, tint = MeeshyTheme.tokens.textMuted.copy(alpha = 0.4f), modifier = Modifier.size(32.dp))
        Text(
            stringResource(if (state.request == Request.FAILED) R.string.message_detail_error_server else R.string.transcription_fiche_empty),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textMuted,
        )
        state.transcribable?.let { attachmentId -> TranscribeButton(state.request, accentColor) { onTranscribe(attachmentId) } }
    }
}

@Composable
private fun TranscribeButton(request: Request, accentColor: Color, onClick: () -> Unit) {
    val inFlight = request == Request.IN_FLIGHT
    val progress = stringResource(R.string.transcription_fiche_a11y_in_progress)
    OutlinedButton(
        onClick = onClick,
        enabled = !inFlight,
        border = BorderStroke(0.5.dp, accentColor.copy(alpha = 0.3f)),
        modifier = Modifier.heightIn(min = 48.dp).semantics { if (inFlight) stateDescription = progress },
    ) {
        if (inFlight) {
            CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        } else {
            Icon(MeeshyIcons.WaveformMic, contentDescription = null, tint = accentColor, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.size(MeeshySpacing.sm))
        Text(
            stringResource(if (request == Request.FAILED) R.string.chat_retry else R.string.transcription_fiche_transcribe),
            color = accentColor,
            fontWeight = FontWeight.Bold,
        )
    }
}

private fun percent(value: Int): String = java.text.NumberFormat.getPercentInstance().format(value / 100.0)

private fun clock(seconds: Int): String = "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
