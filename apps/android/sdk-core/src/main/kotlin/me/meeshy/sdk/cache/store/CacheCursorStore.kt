package me.meeshy.sdk.cache.store

import me.meeshy.core.database.dao.CacheEntryDao
import me.meeshy.sdk.model.cache.PaginationCursor

/**
 * Persists the pagination cursor and `hasMore` of a cached list in its metadata row, so a cold
 * start resumes scrolling where the user left off. It only annotates a key that already holds a
 * list: a cursor without its list would turn a never-synced key into a falsely synced empty one.
 */
class CacheCursorStore(
    private val dao: CacheEntryDao,
    private val namespace: String,
) {
    suspend fun load(key: String): PaginationCursor? =
        PaginationCursor.fromJson(dao.meta(namespace, key)?.payload)

    suspend fun save(cursor: PaginationCursor, key: String) {
        val meta = dao.meta(namespace, key) ?: return
        dao.apply(
            namespace, key,
            deletes = emptyList(), upserts = emptyList(), moves = emptyMap(),
            meta = meta.copy(payload = cursor.toJson()),
        )
    }
}

