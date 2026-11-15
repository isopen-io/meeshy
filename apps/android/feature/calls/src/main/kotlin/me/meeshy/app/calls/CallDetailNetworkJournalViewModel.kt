package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.call.CallNetworkJournalStore
import me.meeshy.sdk.model.call.CallNetworkJournal
import me.meeshy.sdk.model.call.CallNetworkJournalPresentation

/** The « Qualité et réseau » of one call, and the call it belongs to — a sheet never draws another call's journal. */
data class CallNetworkJournalSnapshot(
    val callId: String?,
    val presentation: CallNetworkJournalPresentation?,
) {
    /** What the sheet of [callId] draws: `null` (no section) when unknown, not recorded on this device, or empty. */
    fun shownFor(callId: String): CallNetworkJournalPresentation? =
        presentation?.takeIf { callId == this.callId && !it.isEmpty }
}

/**
 * Reads the network journal this device recorded for a call (#13676) — port of iOS `CallDetailSheet`'s
 * `CallNetworkJournalStore.shared.journal(for:)`: local only, never a network call, hidden when there is nothing.
 */
@HiltViewModel
class CallDetailNetworkJournalViewModel internal constructor(
    private val journal: suspend (String) -> CallNetworkJournal?,
) : ViewModel() {

    @Inject
    constructor(store: CallNetworkJournalStore) : this(store::journal)

    private val _state = MutableStateFlow(CallNetworkJournalSnapshot(callId = null, presentation = null))
    val state: StateFlow<CallNetworkJournalSnapshot> = _state.asStateFlow()

    private var job: Job? = null

    fun load(callId: String) {
        if (callId == _state.value.callId) return
        job?.cancel()
        _state.value = CallNetworkJournalSnapshot(callId = callId, presentation = null)
        if (callId.isBlank()) return
        job = viewModelScope.launch {
            val presentation = journal(callId)?.let(CallNetworkJournalPresentation::of)
            _state.value = CallNetworkJournalSnapshot(callId = callId, presentation = presentation)
        }
    }
}
