package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationAnalysisRepository
import me.meeshy.sdk.model.AnalysisSummaryView
import me.meeshy.sdk.model.ConversationAnalysisProjection
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

/** Load lifecycle of the AI conversation-analysis drill-down. */
enum class AnalysisPhase { Loading, Loaded, Empty, Error }

/**
 * Immutable snapshot of the AI-analysis sheet. The [summary] is the pure projection
 * of the server payload, pre-computed once at load — the Composable stays a renderer.
 * [AnalysisPhase.Empty] means the analysis carried nothing renderable (no summary, or
 * a summary that projects to no content), distinct from a load [AnalysisPhase.Error].
 */
data class ConversationAnalysisUiState(
    val conversationId: String? = null,
    val phase: AnalysisPhase = AnalysisPhase.Loading,
    val summary: AnalysisSummaryView? = null,
) {
    val isLoading: Boolean get() = phase == AnalysisPhase.Loading
    val hasError: Boolean get() = phase == AnalysisPhase.Error
}

/**
 * Drives the AI conversation-analysis card (feature-parity §Chat — "AI conversation
 * analysis: health / tone / topics / emotions"). Stays a thin caller over the pure
 * [ConversationAnalysisProjection]: it fetches once and projects the response into an
 * immutable [ConversationAnalysisUiState]. Load is idempotent; a prior error re-tries.
 */
@HiltViewModel
class ConversationAnalysisViewModel @Inject constructor(
    private val repository: ConversationAnalysisRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationAnalysisUiState())
    val state: StateFlow<ConversationAnalysisUiState> = _state.asStateFlow()

    /**
     * Bind to a conversation and load its analysis. Idempotent for an id already
     * loaded (or in flight); a prior [AnalysisPhase.Error] for the same id re-tries.
     */
    fun load(conversationId: String) {
        val current = _state.value
        if (current.conversationId == conversationId && current.phase != AnalysisPhase.Error) return
        fetch(conversationId)
    }

    /** Re-fetch the current conversation after a failure. */
    fun retry() {
        _state.value.conversationId?.let(::fetch)
    }

    private fun fetch(conversationId: String) {
        _state.value = ConversationAnalysisUiState(
            conversationId = conversationId,
            phase = AnalysisPhase.Loading,
        )
        viewModelScope.launch {
            when (val result = repository.fetchAnalysis(conversationId)) {
                is NetworkResult.Success -> {
                    val view = ConversationAnalysisProjection.summary(result.data)
                    _state.update {
                        it.copy(
                            phase = if (view == null) AnalysisPhase.Empty else AnalysisPhase.Loaded,
                            summary = view,
                        )
                    }
                }

                is NetworkResult.Failure -> _state.update { it.copy(phase = AnalysisPhase.Error) }
            }
        }
    }
}
