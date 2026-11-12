package me.meeshy.app.calls

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.reading.focal.FocalCallJournalOffer
import me.meeshy.ui.R as UiR
import me.meeshy.ui.component.focal.CallJournalRequest
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le journal d'après l'appel sous la bulle d'appel du fil (R1.11, planche A1) : le MÊME journal que le détail de
 * l'historique — [CallDetailTranscriptViewModel] et [CallDetailTranscriptSection], phrases et lignes de capture —, un
 * état par appel. La copie de l'appareil se dessine aussitôt, puis le serveur la revalide : aucun spinner sur un journal
 * déjà chargé. Un appel qui n'a rien gardé le dit (« Aucune transcription ») au lieu d'ouvrir du vide.
 */
@Composable
fun CallJournalUnderBubble(
    conversationId: String,
    request: CallJournalRequest,
    viewModel: CallDetailTranscriptViewModel = hiltViewModel(key = "bubble-journal-${request.callId}"),
) {
    val participantLabel = stringResource(R.string.call_transcript_participant)
    val youLabel = stringResource(R.string.call_avatar_you)
    val transcriptRequest = remember(request.callId, conversationId, request.startedAtIso, youLabel, participantLabel) {
        CallTranscriptRequest(
            callId = request.callId,
            conversationId = conversationId,
            recordStartedAt = request.startedAtIso,
            youLabel = youLabel,
            participantLabel = participantLabel,
        )
    }
    LaunchedEffect(transcriptRequest) { viewModel.load(transcriptRequest) }
    val snapshot by viewModel.state.collectAsStateWithLifecycle()
    val state = snapshot.stateFor(request.callId)
    if (FocalCallJournalOffer.saysNothingWasKept(state)) {
        NothingKept()
        return
    }
    CallDetailTranscriptSection(
        state = state,
        accent = request.accent,
        onRetry = viewModel::retry,
        onDelete = viewModel::delete,
    )
}

@Composable
private fun NothingKept() {
    Text(
        text = stringResource(UiR.string.audio_fullscreen_transcription_empty),
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyTheme.tokens.textMuted,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm),
    )
}
