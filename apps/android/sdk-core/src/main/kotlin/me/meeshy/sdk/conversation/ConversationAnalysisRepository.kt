package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ConversationAnalysis
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Online-only fetcher for a conversation's AI analysis (`GET /conversations/{id}/analysis`,
 * gateway `conversations/analysis`). A thin, dependency-light sibling of
 * [ConversationStatsRepository] — the analysis card is an ephemeral drill-down that
 * neither reads nor writes the Room cache, so it needs only the API, which makes it
 * trivially testable. Transport/HTTP/parse errors fold into a [NetworkResult.Failure]
 * exactly like every other call.
 */
@Singleton
class ConversationAnalysisRepository @Inject constructor(
    private val conversationApi: ConversationApi,
) {
    suspend fun fetchAnalysis(id: String): NetworkResult<ConversationAnalysis> =
        apiCall { conversationApi.analysis(id) }
}
