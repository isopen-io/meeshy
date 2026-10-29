package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.calls.R
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
 * « Transcription » — port of iOS `CallTranscriptSection`: the header with the
 * original/translation toggle, then each line (speaker, elapsed clock, text). Nothing
 * is drawn while loading or when there is nothing to show; a transient failure offers
 * a retry.
 */
@Composable
internal fun CallDetailTranscriptSection(state: CallTranscriptState, accentHex: String, onRetry: () -> Unit) {
    when (state) {
        CallTranscriptState.Loading, CallTranscriptState.Absent -> Unit
        CallTranscriptState.Failed -> TranscriptFailure(onRetry)
        is CallTranscriptState.Ready -> TranscriptLines(state, accentHex)
    }
}

@Composable
private fun TranscriptHeader(trailing: @Composable () -> Unit = {}) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = stringResource(R.string.call_detail_transcript),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing()
    }
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
private fun TranscriptLines(state: CallTranscriptState.Ready, accentHex: String) {
    var showOriginal by rememberSaveable { mutableStateOf(false) }
    val accent = hexColor(accentHex, MeeshyPalette.Indigo500)
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        TranscriptHeader {
            if (state.canShowOriginal) {
                val label = stringResource(
                    if (showOriginal) R.string.call_transcript_show_translated else R.string.call_transcript_show_original,
                )
                IconButton(onClick = { showOriginal = !showOriginal }) {
                    Icon(
                        imageVector = if (showOriginal) MeeshyIcons.TranslateBubble else MeeshyIcons.Subtitles,
                        contentDescription = label,
                        tint = accent,
                    )
                }
            }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(accent.copy(alpha = TRANSCRIPT_TINT_ALPHA), RoundedCornerShape(MeeshyRadius.md))
                .padding(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        ) {
            state.lines.forEach { line -> TranscriptRow(line, showOriginal) }
        }
    }
}

@Composable
private fun TranscriptRow(line: CallTranscriptLine, showOriginal: Boolean) {
    val text = line.text(showOriginal)
    val spoken = listOfNotNull(line.speakerName, line.elapsedLabel).joinToString(", ") + " : " + text
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
                color = if (line.isLocal) MeeshyPalette.Indigo400 else MeeshyPalette.Indigo500,
                modifier = Modifier.weight(1f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            line.elapsedLabel?.let { elapsed ->
                Spacer(Modifier.width(MeeshySpacing.xsPlus))
                Text(elapsed, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
            }
        }
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
    }
}

private const val TRANSCRIPT_TINT_ALPHA = 0.08f
