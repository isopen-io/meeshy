package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase

/**
 * The `sync_meta` key of a thread's recent window ([MessageCacheSource]): its freshness and its validator (`ETag`).
 *
 * #19050 — a thread whose messages leave the cache loses this key with them. Kept, it made the first conditional
 * request after the purge come back 304, which confirmed an EMPTY thread as fresh — for good on a quiet thread.
 */
internal object ThreadSyncKey {
    const val PREFIX: String = "messages:"

    fun of(conversationId: String): String = PREFIX + conversationId
}

/** Empties a thread's cached messages AND forgets its sync key (#19050). Runs inside the caller's transaction. */
internal suspend fun MeeshyDatabase.clearThreadCache(conversationId: String) {
    messageDao().clearConversation(conversationId)
    syncMetaDao().delete(ThreadSyncKey.of(conversationId))
}
