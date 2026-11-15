package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.rawApiCall
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.commitOrWrite

/** Une page de la recherche serveur dans une conversation : ses messages et la suite par curseur. */
data class MessageSearchPage(
    val messages: List<ApiMessage>,
    val nextCursor: String?,
    val hasMore: Boolean,
) {
    companion object {
        val EMPTY = MessageSearchPage(emptyList(), null, false)
    }
}

/** Échec de la recherche serveur ; [unreachable] = le serveur n'a pas pu être joint (hors ligne), pas une erreur. */
class MessageSearchException(message: String, val unreachable: Boolean) : Exception(message)

/**
 * La recherche serveur d'une conversation (`GET conversations/:id/messages/search`) : une page par curseur,
 * dont les messages sont fusionnés dans Room pour que le fil puisse y SAUTER même hors de la fenêtre chargée.
 * Une passerelle qui ne connaît pas la route (404) rend une page vide, jamais une erreur.
 */
internal class MessageSearchReader(
    private val messageApi: MessageApi,
    private val database: MeeshyDatabase,
    private val clock: CacheClock,
    private val fence: AccountFence? = null,
    private val regime: EndToEndRegimeKeeper? = null,
    private val events: MessageEventBuffer? = null,
    private val erasures: PlaintextErasureLedger? = null,
) {
    suspend fun search(conversationId: String, query: String, cursor: String?, limit: Int): MessageSearchPage {
        val ticket = fence?.currentTicket()
        val response = when (val result = rawApiCall { messageApi.search(conversationId, query, limit, cursor) }) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure ->
                if (result.error.httpStatus == NOT_FOUND) return MessageSearchPage.EMPTY
                else throw MessageSearchException(result.error.message, unreachable = result.error.httpStatus == null)
        }
        val page = response.data
        if (!response.success || page == null) {
            throw MessageSearchException(response.error ?: response.message ?: "search refused", unreachable = false)
        }
        val now = clock.nowMillis()
        fence.commitOrWrite(ticket) {
            MessageIngestPipeline(database, regime = regime, events = events, erasures = erasures).ingest(page, now)
        }
        val paging = response.cursorPagination
        return MessageSearchPage(page, paging?.nextCursor, paging?.hasMore ?: false)
    }

    private companion object {
        const val NOT_FOUND = 404
    }
}
