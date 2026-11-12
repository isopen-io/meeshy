package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.calls.R
import me.meeshy.ui.component.focal.CallJournalRequest

/**
 * Le journal d'après l'appel sous la bulle d'appel du fil (R1.11, planche A1) : le MÊME journal que le détail de
 * l'historique — [CallDetailTranscriptViewModel] et [CallDetailTranscriptSection], phrases et lignes de capture —, un
 * état par appel. La copie de l'appareil se dessine aussitôt, puis le serveur la revalide : rien n'est affiché tant que
 * rien n'est connu, donc aucun spinner sur un journal déjà chargé.
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
    CallDetailTranscriptSection(
        state = snapshot.stateFor(request.callId),
        accent = request.accent,
        onRetry = viewModel::retry,
        onDelete = viewModel::delete,
    )
}
