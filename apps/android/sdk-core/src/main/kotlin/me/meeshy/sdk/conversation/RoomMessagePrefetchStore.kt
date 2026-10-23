package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.upsertKeepingLocal
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.chat.HeldMessageWindow
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.rawApiCall

/**
 * La table Room que le fil PEINT avant tout réseau : lue pour savoir ce qui est déjà détenu,
 * écrite avec la page préchargée. Une ligne optimiste (`sendState` non nul) compte dans la
 * fenêtre, jamais dans l'instant serveur le plus récent.
 */
@Singleton
internal class RoomMessagePrefetchStore @Inject constructor(
    private val database: MeeshyDatabase,
    private val messageDao: MessageDao,
    private val clock: CacheClock,
) : MessagePrefetchStore {

    override suspend fun heldWindow(conversationId: String, limit: Int): HeldMessageWindow {
        val rows = messageDao.recentForConversation(conversationId, limit)
        val served = rows.filter { it.sendState == null }
        return HeldMessageWindow(
            count = rows.size,
            serverIds = served.map { it.id }.toSet(),
            newestServerCreatedAtMillis = served.maxOfOrNull { it.createdAt },
        )
    }

    override suspend fun persist(page: List<ApiMessage>, conversationId: String): Boolean {
        val now = clock.nowMillis()
        database.withTransaction {
            messageDao.upsertKeepingLocal(page.map { MessageEntityFactory.cached(it, now, conversationId) })
        }
        return true
    }
}

/** `GET /conversations/:id/messages?offset=0&limit=` sous le jeton courant (intercepteur d'auth). */
@Singleton
internal class ApiMessagePrefetchPageSource @Inject constructor(
    private val messageApi: MessageApi,
) : MessagePrefetchPageSource {

    override suspend fun fetchLatestPage(conversationId: String, limit: Int): List<ApiMessage>? {
        val result = rawApiCall { messageApi.list(conversationId, offset = 0, limit = limit) }
        val body = (result as? NetworkResult.Success)?.data ?: return null
        return body.data?.takeIf { body.success }
    }
}
