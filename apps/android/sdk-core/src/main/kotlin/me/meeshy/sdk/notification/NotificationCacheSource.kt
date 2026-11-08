package me.meeshy.sdk.notification

import androidx.room.withTransaction
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.common.IoDispatcher
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.core.database.dao.NotificationDao
import me.meeshy.core.database.entity.KeyedJsonCacheEntity
import me.meeshy.core.database.entity.NotificationEntity
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.commitOrWrite
import javax.inject.Inject
import javax.inject.Singleton

/** La liste « all » telle qu'elle est gardée : lignes, curseur de la page suivante, `hasMore`, compteur, et l'instant de sync. */
data class PersistedNotifications(
    val items: List<ApiNotification>,
    val nextCursor: String?,
    val hasMore: Boolean,
    val unreadCount: Int,
    val syncedAt: Long?,
)

/** Où la liste survit à la mort du process. [NoNotificationCacheStore] la garde en mémoire seulement. */
interface NotificationCacheStore {
    suspend fun read(): PersistedNotifications?

    /** N'écrit rien si [stillValid] a cessé de l'être (le compte a changé pendant l'attente). */
    suspend fun write(snapshot: PersistedNotifications, stillValid: () -> Boolean)

    /** Vide le disque (déconnexion, changement de compte) : rien d'un compte ne survit chez le suivant. */
    suspend fun clear() = Unit
}

object NoNotificationCacheStore : NotificationCacheStore {
    override suspend fun read(): PersistedNotifications? = null
    override suspend fun write(snapshot: PersistedNotifications, stillValid: () -> Boolean) = Unit
}

@Serializable
private data class PageState(val nextCursor: String? = null, val hasMore: Boolean = false, val unreadCount: Int = 0)

/**
 * Cache Room de la liste des notifications, calqué sur [me.meeshy.sdk.story.StoryCacheSource] : les lignes dans
 * `notifications`, le curseur / `hasMore` / compteur dans `keyed_json_cache`, écrits dans la MÊME transaction pour que
 * la pagination survive à la mort du process avec la liste qu'elle prolonge.
 */
@Singleton
class RoomNotificationCacheStore @Inject constructor(
    private val database: MeeshyDatabase,
    private val dao: NotificationDao,
    private val keyed: KeyedJsonCacheDao,
    private val fence: AccountFence,
    @IoDispatcher private val dispatcher: CoroutineDispatcher,
) : NotificationCacheStore {

    override suspend fun read(): PersistedNotifications? = withContext(dispatcher) {
        val rows = dao.all(NotificationScope.ALL_KEY)
        val state = keyed.find(NAMESPACE, KEY)
        if (rows.isEmpty() && state == null) return@withContext null
        val page = state?.let { decodedStateOrNull(it.payload) } ?: PageState()
        PersistedNotifications(
            items = rows.mapNotNull(::decodedOrNull),
            nextCursor = page.nextCursor,
            hasMore = page.hasMore,
            unreadCount = page.unreadCount,
            syncedAt = state?.fetchedAt,
        )
    }

    /** Une ligne qui ne se relit plus ne coûte qu'elle-même : la révalidation suivante la réécrit ou l'élague. */
    private fun decodedOrNull(row: NotificationEntity): ApiNotification? =
        try {
            MeeshyApi.json.decodeFromString<ApiNotification>(row.payload)
        } catch (_: IllegalArgumentException) {
            null
        }

    private fun decodedStateOrNull(payload: String): PageState? =
        try {
            MeeshyApi.json.decodeFromString<PageState>(payload)
        } catch (_: IllegalArgumentException) {
            null
        }

    override suspend fun write(snapshot: PersistedNotifications, stillValid: () -> Boolean) {
        val ticket = fence.currentTicket()
        if (!stillValid()) return
        val now = snapshot.syncedAt ?: 0L
        val kept = snapshot.items.take(MAX_ROWS)
        val truncated = kept.size < snapshot.items.size
        val rows = withContext(dispatcher) {
            kept.map { it.toEntity(now) } to MeeshyApi.json.encodeToString(
                PageState(
                    nextCursor = if (truncated) null else snapshot.nextCursor,
                    hasMore = snapshot.hasMore || truncated,
                    unreadCount = snapshot.unreadCount,
                ),
            )
        }
        fence.commitOrWrite(ticket) {
            database.withTransaction {
                dao.deleteScope(NotificationScope.ALL_KEY)
                dao.upsertAll(rows.first)
                keyed.upsert(KeyedJsonCacheEntity(NAMESPACE, KEY, rows.second, now))
            }
        }
    }

    override suspend fun clear() {
        database.withTransaction {
            dao.deleteScope(NotificationScope.ALL_KEY)
            keyed.delete(NAMESPACE, KEY)
        }
    }

    private fun ApiNotification.toEntity(cachedAt: Long) = NotificationEntity(
        id = id,
        scopeKey = NotificationScope.ALL_KEY,
        payload = MeeshyApi.json.encodeToString(this),
        createdAt = isoToEpochMillis(state.createdAt),
        isRead = state.isRead,
        cachedAt = cachedAt,
    )

    internal companion object {
        const val NAMESPACE: String = "notifications"
        const val KEY: String = "page-state"
        const val MAX_ROWS: Int = 200
    }
}
