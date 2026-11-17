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

    /**
     * #19114 — the key of the gap a thread holds under its recent window, present only while one exists: its
     * `contentWatermarkMillis` is the instant of the oldest message of the segment above it ([me.meeshy.sdk.model.sync.ThreadContiguity.gapTop]).
     * It shares [PREFIX], so the cache purge forgets it with the thread's own key.
     */
    fun gapOf(conversationId: String): String = PREFIX + conversationId + GAP_SUFFIX

    private const val GAP_SUFFIX = ":gap"
}

/** Forgets every sync key of a thread: its freshness and validator, and its gap (#19050, #19114). */
internal suspend fun MeeshyDatabase.forgetThreadSync(conversationId: String) {
    syncMetaDao().delete(ThreadSyncKey.of(conversationId))
    syncMetaDao().delete(ThreadSyncKey.gapOf(conversationId))
}

/** Empties a thread's cached messages AND forgets its sync keys (#19050). Runs inside the caller's transaction. */
internal suspend fun MeeshyDatabase.clearThreadCache(conversationId: String) {
    messageDao().clearConversation(conversationId)
    forgetThreadSync(conversationId)
}
