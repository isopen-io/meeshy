package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.CallRecordsRepository
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.call.CallTranscriptReader
import me.meeshy.sdk.model.call.CallTranscriptReplay
import me.meeshy.sdk.model.call.CallTranscriptState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository

/** What the transcript of one call detail is loaded for, with the sheet's localised labels. */
data class CallTranscriptRequest(
    val callId: String,
    val recordStartedAt: String,
    val youLabel: String,
    val participantLabel: String,
)

/** The transcript state and the call it belongs to — a sheet never draws another call's lines. */
data class CallTranscriptSnapshot(
    val callId: String?,
    val state: CallTranscriptState,
) {
    fun stateFor(callId: String): CallTranscriptState =
        if (callId == this.callId) state else CallTranscriptState.Loading
}

/**
 * Loads the « Transcription » of the call detail — port of iOS `CallTranscriptLoader`:
 * the server replay (`GET /calls/{callId}/transcript`), projected for the reader by
 * [CallTranscriptReplay]. The transcript is SENSITIVE: [CallRecordsRepository] keeps no
 * cache of it, so every opening reads it again; nothing is drawn meanwhile (as iOS),
 * so a call without transcript never flashes a placeholder.
 */
@HiltViewModel
class CallDetailTranscriptViewModel @Inject constructor(
    private val records: CallRecordsRepository,
    private val session: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(CallTranscriptSnapshot(callId = null, state = CallTranscriptState.Loading))
    val state: StateFlow<CallTranscriptSnapshot> = _state.asStateFlow()

    private var request: CallTranscriptRequest? = null
    private var job: Job? = null

    fun load(request: CallTranscriptRequest) {
        if (request == this.request && _state.value.state != CallTranscriptState.Failed) return
        this.request = request
        fetch(request)
    }

    fun retry() {
        request?.let(::fetch)
    }

    private fun fetch(request: CallTranscriptRequest) {
        job?.cancel()
        if (request.callId.isBlank()) {
            publish(request, CallTranscriptState.Absent)
            return
        }
        publish(request, CallTranscriptState.Loading)
        job = viewModelScope.launch {
            val state = when (val result = records.transcript(request.callId)) {
                is NetworkResult.Success -> CallTranscriptState.of(
                    CallTranscriptReplay.lines(
                        page = result.data,
                        reader = reader(),
                        recordStartedAt = request.recordStartedAt,
                        youLabel = request.youLabel,
                        participantLabel = request.participantLabel,
                    ),
                )
                is NetworkResult.Failure -> CallTranscriptState.forFailure(result.error.httpStatus)
            }
            publish(request, state)
        }
    }

    private fun publish(request: CallTranscriptRequest, state: CallTranscriptState) {
        _state.value = CallTranscriptSnapshot(callId = request.callId, state = state)
    }

    private fun reader(): CallTranscriptReader {
        val user = session.currentUser.value
        return CallTranscriptReader(
            userId = user?.id,
            name = user?.effectiveDisplayName,
            prism = if (user == null) {
                listOfNotNull(Locale.getDefault().language.takeIf { it.isNotBlank() })
            } else {
                ReaderPrism.resolve(user, Locale.getDefault())
            },
        )
    }
}
