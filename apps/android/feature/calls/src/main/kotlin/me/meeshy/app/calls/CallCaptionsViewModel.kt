package me.meeshy.app.calls

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.call.CallCaptionLabels
import me.meeshy.sdk.model.call.CallCaptionReader
import me.meeshy.sdk.model.call.CallCaptionsState
import me.meeshy.sdk.model.call.CallJournalSegment
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

    /** One tap on « Sous-titres »: Off, Translated, Original, Off. */
    fun advance() = captions.advance()

    /** The band: the last two sentences. */
    fun bandLines(state: CallCaptionsState, labels: CallCaptionLabels): List<CallLiveCaptionLine> =
        captions.captionLines(state.journal.tail(BAND_LINES), state, labels)

    /** The journal: every sentence of the call, each dated by the time in the call (P6.4). */
    fun journalLines(state: CallCaptionsState, labels: CallCaptionLabels): List<CallLiveCaptionLine> =
        captions.captionLines(state.journal.segments, state, labels).map { it.dated(state.callStartedAtMs) }

    fun toggleReveal(key: String) = captions.toggleReveal(key)

    fun setShowsOriginal(showsOriginal: Boolean) = captions.setShowsOriginal(showsOriginal)

    fun openJournal() = captions.openJournal()
}

/** The Prisme projection of journal segments onto the lines the band, the sheet and the panel draw. */
internal fun CallCaptionsController.captionLines(
    segments: List<CallJournalSegment>,
    state: CallCaptionsState,
    labels: CallCaptionLabels,
): List<CallLiveCaptionLine> = CallLiveCaptionLines.lines(
    segments = segments,
    reader = reader,
    peerName = peerDisplayName,
    prefersOriginal = state.showsOriginal,
    revealed = state.revealed,
    labels = labels,
)
