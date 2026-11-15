package me.meeshy.sdk.mediahub

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.mediahub.ConversationMediaKind
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.rawApiCall

/** Une page de porteurs : [nextCursor] est l'ancre de la suite, [hasMore] dit s'il reste des pages. */
data class MediaHubPage(val carriers: List<ApiMessage>, val nextCursor: String?, val hasMore: Boolean)

/** Lit l'index d'un genre sur la passerelle (`view=media`) : la couture réseau de l'écran « Médias, liens et documents ». */
@Singleton
class ConversationMediaHubRepository @Inject constructor(private val messageApi: MessageApi) {

    suspend fun page(
        conversationId: String,
        kind: ConversationMediaKind,
        query: String?,
        before: String?,
        languages: List<String>,
        limit: Int = PAGE_SIZE,
    ): NetworkResult<MediaHubPage> =
        rawApiCall {
            messageApi.listMedia(
                conversationId = conversationId,
                view = "media",
                limit = limit,
                includeReplies = false,
                includeTranslations = true,
                kinds = ConversationMediaKind.kindsQuery(listOf(kind)),
                query = ConversationMediaKind.searchQuery(query),
                before = before,
                languages = languages.takeIf { it.isNotEmpty() }?.joinToString(","),
            )
        }.map { response ->
            val cursor = response.cursorPagination
            val hasMore = cursor?.hasMore ?: response.pagination?.hasMore ?: (response.data.size >= limit)
            MediaHubPage(response.data, cursor?.nextCursor ?: response.data.lastOrNull()?.id, hasMore)
        }

    companion object {
        const val PAGE_SIZE: Int = 30
    }
}
