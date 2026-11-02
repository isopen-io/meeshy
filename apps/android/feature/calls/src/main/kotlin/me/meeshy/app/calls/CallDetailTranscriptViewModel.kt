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
import me.meeshy.sdk.call.CachedCallTranscript
import me.meeshy.sdk.call.CallRecordsRepository
import me.meeshy.sdk.call.CallTranscriptCache
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.call.CallTranscriptCacheAction
import me.meeshy.sdk.model.call.CallTranscriptPage
import me.meeshy.sdk.model.call.CallTranscriptReader
import me.meeshy.sdk.model.call.CallTranscriptRefresh
import me.meeshy.sdk.model.call.CallTranscriptRemote
import me.meeshy.sdk.model.call.CallTranscriptReplay
import me.meeshy.sdk.model.call.CallTranscriptRevalidation
import me.meeshy.sdk.model.call.CallTranscriptState
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository

/** What the transcript of one call detail is loaded for, with the sheet's localised labels. */
data class CallTranscriptRequest(
    val callId: String,
    val conversationId: String,
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
 * Loads the « Transcription » of the call detail — port of iOS `CallTranscriptLoader` (#13673, #13677): the
 * encrypted copy on this device ([CallTranscriptCache]) is drawn at once, offline included, then the server replay
 * (`GET /calls/{callId}/transcript`) revalidates it ([CallTranscriptRevalidation]). Nothing is drawn while nothing is
 * known (as iOS), so a call without transcript never flashes a placeholder. A conversation sealed end to end has no
 * server transcript: nothing is fetched, no copy is kept. [delete] removes the transcript from this device for good.
 */
@HiltViewModel
class CallDetailTranscriptViewModel internal constructor(
    private val records: CallRecordsRepository,
    private val session: SessionRepository,
    private val cache: CallTranscriptCache,
    private val regime: CallConversationRegime,
) : ViewModel() {

    @Inject
    constructor(
        records: CallRecordsRepository,
        session: SessionRepository,
        cache: CallTranscriptCache,
        regime: LedgerCallConversationRegime,
    ) : this(records, session, cache, regime.asRegime())

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

    /** « Supprimer ce transcript », confirmed: gone from the sheet at once, then from the device. */
    fun delete() {
        val request = request ?: return
        job?.cancel()
        publish(request, CallTranscriptState.Absent)
        job = viewModelScope.launch { cache.dismiss(request.callId) }
    }

    private fun fetch(request: CallTranscriptRequest) {
        job?.cancel()
        if (request.callId.isBlank()) {
            publish(request, CallTranscriptState.Absent)
            return
        }
        val shown = _state.value
        if (shown.callId != request.callId || shown.state !is CallTranscriptState.Ready) publish(request, CallTranscriptState.Loading)
        job = viewModelScope.launch {
            if (regime.isEndToEnd(request.conversationId) == true) {
                apply(request, CallTranscriptRevalidation.sealedEndToEnd)
                return@launch
            }
            val cached = when (val held = cache.cached(request.callId)) {
                CachedCallTranscript.Dismissed -> {
                    publish(request, CallTranscriptState.Absent)
                    return@launch
                }
                is CachedCallTranscript.Copy -> CallTranscriptState.of(project(held.page, request)).also { publish(request, it) }
                CachedCallTranscript.None -> null
            }
            val remote = when (val result = records.transcript(request.callId)) {
                is NetworkResult.Success -> CallTranscriptRemote.Served(result.data)
                is NetworkResult.Failure -> CallTranscriptRemote.Failed(result.error.httpStatus)
            }
            apply(request, CallTranscriptRevalidation.revalidated(cached, remote) { page -> project(page, request) })
        }
    }

    private suspend fun apply(request: CallTranscriptRequest, refresh: CallTranscriptRefresh) {
        publish(request, refresh.state)
        when (val action = refresh.cache) {
            CallTranscriptCacheAction.Keep -> Unit
            CallTranscriptCacheAction.Drop -> cache.drop(request.callId)
            is CallTranscriptCacheAction.Store -> cache.store(request.callId, action.page)
        }
    }

    private fun project(page: CallTranscriptPage, request: CallTranscriptRequest) = CallTranscriptReplay.lines(
        page = page,
        reader = reader(),
        recordStartedAt = request.recordStartedAt,
        youLabel = request.youLabel,
        participantLabel = request.participantLabel,
    )

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

private fun LedgerCallConversationRegime.asRegime(): CallConversationRegime = this
