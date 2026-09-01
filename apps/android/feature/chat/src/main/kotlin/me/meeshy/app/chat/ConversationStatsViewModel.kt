package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.ConversationStatsRepository
import me.meeshy.sdk.model.ActivityPeriod
import me.meeshy.sdk.model.ActivityPoint
import me.meeshy.sdk.model.ClientStatMessage
import me.meeshy.sdk.model.ContentTypeShare
import me.meeshy.sdk.model.ConversationMessageStatsResponse
import me.meeshy.sdk.model.ConversationStatsProjection
import me.meeshy.sdk.model.DailyActivityEntry
import me.meeshy.sdk.model.LanguageShare
import me.meeshy.sdk.model.ParticipantShare
import me.meeshy.sdk.model.SentimentBreakdown
import me.meeshy.sdk.model.SentimentBreakdownProjection
import me.meeshy.sdk.net.NetworkResult
import java.time.LocalDate
import javax.inject.Inject

/** Load lifecycle of the conversation stats drill-down. */
enum class StatsPhase { Loading, Loaded, Empty, Error }

/**
 * Fully-projected, immutable snapshot of the stats sheet. Every time-independent
 * projection is pre-computed once at load; the activity series stays a pure
 * function of an injected `today` so the caller (Composable) supplies the clock —
 * the same "pass time in" doctrine the chat header already uses for presence.
 */
data class ConversationStatsUiState(
    val conversationId: String? = null,
    val phase: StatsPhase = StatsPhase.Loading,
    val period: ActivityPeriod = ActivityPeriod.WEEK,
    val totalMessages: Int = 0,
    val totalWords: Int = 0,
    val totalCharacters: Int = 0,
    val contentTypes: List<ContentTypeShare> = emptyList(),
    val participants: List<ParticipantShare> = emptyList(),
    val languages: List<LanguageShare> = emptyList(),
    val hourly: List<Int> = emptyList(),
    val dailyActivity: List<DailyActivityEntry> = emptyList(),
    /**
     * The on-device three-way sentiment split of the loaded messages, or null when
     * no text message could be scored. Computed client-side (like iOS) from the
     * conversation's own content, so it is independent of the network stats fetch
     * and survives a fetch failure.
     */
    val sentiment: SentimentBreakdown? = null,
) {
    val isLoading: Boolean get() = phase == StatsPhase.Loading
    val hasError: Boolean get() = phase == StatsPhase.Error

    /** The activity points for the selected [period] as of [today]; recomputed on period switch, no refetch. */
    fun activity(today: LocalDate): List<ActivityPoint> =
        ConversationStatsProjection.activitySeries(dailyActivity, period, today)
}

/**
 * Drives the conversation stats dashboard (feature-parity §Chat — "Conversation
 * stats rings + activity-over-time + content-type breakdown"). Stays a thin caller
 * over the pure [ConversationStatsProjection]: it fetches once, projects the
 * response into an immutable [ConversationStatsUiState], and lets a period switch
 * re-derive the activity window locally rather than round-tripping the network.
 */
@HiltViewModel
class ConversationStatsViewModel @Inject constructor(
    private val repository: ConversationStatsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ConversationStatsUiState())
    val state: StateFlow<ConversationStatsUiState> = _state.asStateFlow()

    /**
     * Bind to a conversation and load its stats. [clientMessages] are the messages
     * already on screen: they seed the sheet with a locally-computed snapshot
     * INSTANTLY (cache-first — no spinner) and are scored on-device into the
     * sentiment split, both pure fast passes with no network. The server aggregation
     * then refines them; if it fails, the locally-computed snapshot STAYS instead of
     * collapsing to an error (offline graceful degradation, parity iOS's
     * server-first/client-fallback dashboard). With no local messages the sheet
     * shows a spinner then, on a failed fetch, the error state.
     *
     * Idempotent for an id already loaded (or in flight); a prior [StatsPhase.Error]
     * for the same id re-tries and re-seeds.
     */
    fun load(conversationId: String, clientMessages: List<ClientStatMessage> = emptyList()) {
        val current = _state.value
        if (current.conversationId == conversationId && current.phase != StatsPhase.Error) return
        val sentiment = SentimentBreakdownProjection
            .breakdown(clientMessages.map { it.content })
            .takeIf { it.hasContent }
        val fallback = clientMessages
            .takeIf { it.isNotEmpty() }
            ?.let { ConversationStatsProjection.clientComputed(conversationId, it) }
        fetch(conversationId, sentiment, fallback)
    }

    /** Re-fetch the current conversation after a failure, keeping the already-scored sentiment. */
    fun retry() {
        val current = _state.value
        current.conversationId?.let { fetch(it, current.sentiment, fallback = null) }
    }

    /** Switch the activity window. Pure — no refetch, the [ConversationStatsUiState.activity] getter reflects it. */
    fun selectPeriod(period: ActivityPeriod) {
        if (_state.value.period == period) return
        _state.update { it.copy(period = period) }
    }

    private fun fetch(
        conversationId: String,
        sentiment: SentimentBreakdown?,
        fallback: ConversationMessageStatsResponse?,
    ) {
        val base = ConversationStatsUiState(
            conversationId = conversationId,
            phase = StatsPhase.Loading,
            period = _state.value.period,
            sentiment = sentiment,
        )
        // Cache-first: render the locally-computed page immediately when we have one.
        _state.value = fallback?.let { project(base, it) } ?: base
        viewModelScope.launch {
            when (val result = repository.fetchStats(conversationId)) {
                is NetworkResult.Success -> _state.update { project(it, result.data) }
                is NetworkResult.Failure -> _state.update { state ->
                    // A failed refine leaves the locally-computed snapshot standing;
                    // only a fetch with nothing local to fall back on surfaces the error.
                    if (fallback != null) state else state.copy(phase = StatsPhase.Error)
                }
            }
        }
    }

    private fun project(
        base: ConversationStatsUiState,
        data: ConversationMessageStatsResponse,
    ): ConversationStatsUiState = base.copy(
        phase = if (data.totalMessages <= 0) StatsPhase.Empty else StatsPhase.Loaded,
        totalMessages = data.totalMessages,
        totalWords = data.totalWords,
        totalCharacters = data.totalCharacters,
        contentTypes = ConversationStatsProjection.contentTypeBreakdown(data.contentTypes),
        participants = ConversationStatsProjection.participantShares(data.participantStats, data.totalMessages),
        languages = ConversationStatsProjection.languageShares(data.languageDistribution),
        hourly = ConversationStatsProjection.hourlyBuckets(data.hourlyDistribution),
        dailyActivity = data.dailyActivity,
    )
}
