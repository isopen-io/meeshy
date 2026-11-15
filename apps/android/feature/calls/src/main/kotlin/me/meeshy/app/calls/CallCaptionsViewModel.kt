package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.call.CallCaptionLabels
import me.meeshy.sdk.model.call.CallCaptionReader
import me.meeshy.sdk.model.call.CallCaptionsState
import me.meeshy.sdk.model.call.CallJournalSegment
import me.meeshy.sdk.model.call.CallJournalView
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.sdk.model.call.CallLiveCaptionLines

internal const val BAND_LINES = 2

/** The screen's door to the captions: the chip folded into [CallUiState], the journal, the journal requests. */
@HiltViewModel
class CallCaptionsViewModel @Inject constructor(
    private val captions: CallCaptionsController,
) : ViewModel() {
    val state: StateFlow<CallCaptionsState> = captions.state
    val journalRequests: SharedFlow<Unit> = captions.journalRequests
    val reader: CallCaptionReader get() = captions.reader
    val peerName: String get() = captions.peerDisplayName

    private val _journalView = MutableStateFlow(CallJournalView())

    /** The journal's own reading (its switch, its touched sentences): the band never reads it (P13.5, law 7). */
    val journalView: StateFlow<CallJournalView> = _journalView.asStateFlow()

    /** One tap on « Sous-titres »: Off, Translated, Original, Off. */
    fun advance() = captions.advance()

    /** The band: the last two sentences, read in the « Sous-titres » button's mode only. */
    fun bandLines(
        state: CallCaptionsState,
        labels: CallCaptionLabels,
        participantNames: Map<String, String> = emptyMap(),
    ): List<CallLiveCaptionLine> =
        captions.captionLines(state.journal.tail(BAND_LINES), state.showsOriginal, state.revealed, labels, participantNames)

    /** The journal: every sentence of the call, read in ITS switch, each dated by the time in the call (P6.4). */
    fun journalLines(
        state: CallCaptionsState,
        view: CallJournalView,
        labels: CallCaptionLabels,
        participantNames: Map<String, String> = emptyMap(),
    ): List<CallLiveCaptionLine> =
        captions.captionLines(state.journal.segments, view.showsOriginal, view.revealed, labels, participantNames)
            .map { it.dated(state.callStartedAtMs) }

    /** A touch on a sentence of the band. */
    fun toggleReveal(key: String) = captions.toggleReveal(key)

    /** A touch on a sentence of the journal: it unfolds there only. */
    fun toggleJournalReveal(key: String) = _journalView.update { it.togglingReveal(key) }

    /** The journal's Translated · Original switch: the band does not follow. */
    fun setJournalShowsOriginal(showsOriginal: Boolean) = _journalView.update { it.showing(showsOriginal) }

    fun openJournal() = captions.openJournal()
}

/** The Prisme projection of journal segments onto the lines the band, the sheet and the panel draw. */
internal fun CallCaptionsController.captionLines(
    segments: List<CallJournalSegment>,
    prefersOriginal: Boolean,
    revealed: Set<String>,
    labels: CallCaptionLabels,
    participantNames: Map<String, String> = emptyMap(),
): List<CallLiveCaptionLine> = CallLiveCaptionLines.lines(
    segments = segments,
    reader = reader,
    peerName = peerDisplayName,
    prefersOriginal = prefersOriginal,
    revealed = revealed,
    labels = labels,
    participantNames = participantNames,
)
