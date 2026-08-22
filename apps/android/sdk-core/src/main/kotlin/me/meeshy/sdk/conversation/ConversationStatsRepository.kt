package me.meeshy.sdk.conversation

import me.meeshy.sdk.model.ConversationMessageStatsResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Online-only fetcher for a conversation's aggregated message statistics
 * (`GET /conversations/{id}/stats`, gateway `conversations/stats.ts`). Kept as a
 * thin, dependency-light sibling of [ConversationRepository] — the stats screen is
 * an ephemeral drill-down that neither reads nor writes the Room cache, so it needs
 * only the API, which makes it trivially testable. Transport/HTTP/parse errors fold
 * into a [NetworkResult.Failure] exactly like every other call.
 */
@Singleton
class ConversationStatsRepository @Inject constructor(
    private val conversationApi: ConversationApi,
) {
    suspend fun fetchStats(id: String): NetworkResult<ConversationMessageStatsResponse> =
        apiCall { conversationApi.stats(id) }
}
