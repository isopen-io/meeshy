package me.meeshy.app.calls

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.CallSpeakerColor
import me.meeshy.sdk.model.call.CallCaptureKind
import me.meeshy.sdk.model.call.CallDetailParticipantRow
import me.meeshy.sdk.model.call.CallTranscriptLine
import me.meeshy.sdk.model.call.CallTranscriptState
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * « Participants » — port of iOS `CallDetailSheet.participantsSection` (#8066): who
 * joined a group call, reader excluded, a name and a face, never a presence.
 */
@Composable
internal fun CallDetailParticipantsSection(participants: List<CallDetailParticipantRow>) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(MeeshyRadius.md))
            .padding(bottom = MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.call_detail_participants),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textMuted,
            modifier = Modifier
                .padding(horizontal = MeeshySpacing.md)
                .padding(top = MeeshySpacing.md)
                .semantics { heading() },
        )
        participants.forEach { participant ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
                    .clearAndSetSemantics { contentDescription = participant.name },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                MeeshyAvatar(
                    name = participant.name,
                    size = 40.dp,
                    containerColor = hexColor(DynamicColorGenerator.colorForName(participant.name), MeeshyPalette.Indigo500),
                    imageUrl = participant.avatarUrl,
                )
                Text(
                    text = participant.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/**
 * « Transcription » — port of iOS `CallTranscriptSection`: the header, each line (speaker, elapsed clock, text,
 * « Original · … » below a translation), then the original/translation toggle at the foot. Nothing
 * is drawn while loading or when there is nothing to show; a transient failure offers
 * a retry.
 */
@Composable
internal fun CallDetailTranscriptSection(
    state: CallTranscriptState,
    accent: Color,
    onRetry: () -> Unit,
    onDelete: () -> Unit,
) {
    when (state) {
        CallTranscriptState.ReadingCopy, CallTranscriptState.Loading, CallTranscriptState.Absent -> Unit
        CallTranscriptState.Failed -> TranscriptFailure(onRetry)
        is CallTranscriptState.Ready -> TranscriptLines(state, accent, onDelete)
    }
}

@Composable
private fun TranscriptHeader() {
    Text(
        text = stringResource(R.string.call_detail_transcript),
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textPrimary,
        modifier = Modifier.fillMaxWidth().semantics { heading() },
    )
}

@Composable
private fun TranscriptFailure(onRetry: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        TranscriptHeader()
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = stringResource(R.string.call_history_error),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
                Text(stringResource(R.string.call_action_retry))
            }
        }
    }
}

@Composable
private fun TranscriptLines(state: CallTranscriptState.Ready, accent: Color, onDelete: () -> Unit) {
    var showOriginal by rememberSaveable { mutableStateOf(false) }
    val reduceMotion = rememberCallReduceMotion()
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        TranscriptHeader()
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(accent.copy(alpha = TRANSCRIPT_TINT_ALPHA), RoundedCornerShape(MeeshyRadius.md))
                .padding(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            state.lines.forEach { line ->
                val kind = line.captureKind
                if (kind == null) TranscriptRow(line, showOriginal, reduceMotion) else CaptureRow(line, kind)
            }
        }
        if (state.canShowOriginal) OriginalToggle(showOriginal, accent) { showOriginal = it }
        TranscriptDisclaimer()
        TranscriptDeletion(onDelete)
    }
}

/** « Voir l'original » at the foot of the journal: one switch for the whole call, its label and effect unchanged (#17862). */
@Composable
private fun OriginalToggle(showOriginal: Boolean, accent: Color, onChange: (Boolean) -> Unit) {
    val label = stringResource(if (showOriginal) R.string.call_transcript_show_translated else R.string.call_transcript_show_original)
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
            .toggleable(value = showOriginal, role = Role.Switch, onValueChange = onChange),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(text = label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = accent)
    }
}

/** Says where the transcript lives — here AND on the server (the iOS sentence « jamais envoyée au serveur » is not true). */
@Composable
private fun TranscriptDisclaimer() {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        Icon(
            imageVector = MeeshyIcons.Info,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = stringResource(R.string.call_transcript_disclaimer),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

/** « Supprimer ce transcript », always confirmed (iOS `CallTranscriptSection`). */
@Composable
private fun TranscriptDeletion(onDelete: () -> Unit) {
    var confirming by rememberSaveable { mutableStateOf(false) }
    TextButton(onClick = { confirming = true }, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(
            text = stringResource(R.string.call_transcript_delete),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyPalette.Error,
        )
    }
    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text(stringResource(R.string.call_transcript_delete_confirm_title)) },
            text = { Text(stringResource(R.string.call_transcript_delete_confirm_message)) },
            confirmButton = {
                TextButton(onClick = {
                    confirming = false
                    onDelete()
                }) {
                    Text(stringResource(R.string.call_transcript_delete), color = MeeshyPalette.Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }) { Text(stringResource(R.string.call_journal_cancel)) }
            },
        )
    }
}

@Composable
private fun TranscriptRow(line: CallTranscriptLine, showOriginal: Boolean, reduceMotion: Boolean) {
    val secondary = line.secondary(showOriginal)
    val spoken = CallTranscriptRowAccessibility.label(
        line = line,
        showOriginal = showOriginal,
        originalWord = stringResource(R.string.call_captions_original),
        translatedWord = stringResource(R.string.call_captions_translated),
    )
    val scheme = authorScheme()
    val speakerColor = hexColor(CallSpeakerColor.hex(line.speakerId.ifBlank { line.speakerName }, scheme), MeeshyTheme.tokens.textPrimary)
    val fadeMillis = fadeMillis(reduceMotion)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clearAndSetSemantics { contentDescription = spoken },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = line.speakerName,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = speakerColor,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            line.elapsedLabel?.let { elapsed ->
                Spacer(Modifier.width(MeeshySpacing.xsPlus))
                Text(
                    text = elapsed,
                    style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum"),
                    color = MeeshyTheme.tokens.textMuted,
                )
            }
        }
        AnimatedContent(
            targetState = line.servesTranslation && showOriginal,
            transitionSpec = { fadeIn(tween(fadeMillis)) togetherWith fadeOut(tween(fadeMillis)) },
            label = "transcript-leading",
        ) { original ->
            val textColor = CallSpeakerColor.textHex(line.speakerId.ifBlank { line.speakerName }, servesTranslation = line.showsTranslation(original), mode = scheme)
                ?.let { hexColor(it, MeeshyTheme.tokens.textPrimary) } ?: MeeshyTheme.tokens.textPrimary
            Text(line.text(original), style = MaterialTheme.typography.bodyMedium, color = textColor)
        }
        CallCaptionSecondaryBelow(secondary, reduceMotion, ink = MeeshyTheme.tokens.textSecondary)
    }
}

/** The author's colour follows the theme chosen IN the app (A1.9), as the card and the inks do — not the system's. */
@Composable
private fun authorScheme(): DynamicColorGenerator.ThemeMode =
    if (MeeshyTheme.isDark) DynamicColorGenerator.ThemeMode.DARK else DynamicColorGenerator.ThemeMode.LIGHT

/**
 * #16665 — « Awa · a capturé l'écran » : the name (and its dot) in the author's colour,
 * the phrase in secondary ink, never coloured; a call-recording bound names nobody.
 */
@Composable
private fun CaptureRow(line: CallTranscriptLine, kind: CallCaptureKind) {
    val scheme = authorScheme()
    val nameColor = hexColor(CallSpeakerColor.hex(line.speakerId.ifBlank { line.speakerName }, scheme), MeeshyTheme.tokens.textPrimary)
    CallCaptureLine(name = line.speakerName, nameColor = nameColor, kind = kind, elapsed = line.elapsedLabel, ink = MeeshyTheme.tokens.textSecondary)
}

private const val TRANSCRIPT_TINT_ALPHA = 0.08f
