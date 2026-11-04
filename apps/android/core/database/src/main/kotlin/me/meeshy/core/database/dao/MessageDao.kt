package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.MessageEntity

@Dao
public interface MessageDao {

    /**
     * Observes a conversation's messages, oldest first. Ordering will move to
     * the server `seq` once the gateway provides it (ADR-021); until then it is
     * `createdAt`.
     */
    @Query("SELECT * FROM messages WHERE conversationId = :conversationId ORDER BY createdAt ASC")
    public fun observeForConversation(conversationId: String): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE id = :id")
    public suspend fun find(id: String): MessageEntity?

    /** Les lignes du fil dont la charge nomme [postId] : candidates à une citation retirée (#13296). */
    @Query("SELECT * FROM messages WHERE conversationId = :conversationId AND payload LIKE '%' || :postId || '%'")
    public suspend fun mentioning(conversationId: String, postId: String): List<MessageEntity>

    /**
     * Les lignes qui PEUVENT porter [userId] : son propre message (colonne `senderId`) ou une charge qui le nomme
     * (citation, transfert). Un pré-filtre SQL qui sur-sélectionne — l'id peut figurer dans une URL — ; la loi se
     * lit sur la charge décodée. [userId] est apparié littéralement : échapper `\`, `%` et `_` par `\` d'abord.
     */
    @Query("SELECT * FROM messages WHERE senderId = :rawUserId OR payload LIKE '%' || :userId || '%' ESCAPE '\\'")
    public suspend fun involving(rawUserId: String, userId: String): List<MessageEntity>

    /**
     * #13792 — parmi les [window] lignes les plus RÉCENTES du fil, celles qui PEUVENT dire le bout en bout (drapeau chiffré,
     * ou « e2ee » dans la charge : mode du message, d'une pièce, avis d'activation, lignes non encore rétro-remplies
     * comprises). Le filtre de texte ne court que sur la fenêtre, jamais sur tout l'historique : la sous-requête ne trie que
     * des identifiants, par l'index `(conversationId, createdAt)`. Un pré-filtre : la loi se lit sur la charge décodée
     * (`EndToEndRegimeMemory.cachedThreadSeals`). Les avis de désactivation n'y sont pas lus : comme iOS et le web, aucun
     * avis ne rouvre (#12949, #13821), et un serveur compromis ne peut pas rouvrir le clair par un avis.
     */
    @Query(
        "SELECT * FROM messages WHERE id IN (" +
            "SELECT id FROM messages WHERE conversationId = :conversationId ORDER BY createdAt DESC LIMIT :window) " +
            "AND (isEncrypted = 1 OR payload LIKE '%e2ee%' OR payload LIKE '%\"isEncrypted\":true%')",
    )
    public suspend fun endToEndCandidates(conversationId: String, window: Int): List<MessageEntity>

    /**
     * Le dernier message ACQUITTÉ du fil : celui qu'un résumé de lecture non nommé (passerelle d'avant #7433)
     * décrit. Un envoi en vol (`sendState` posé, pas d'id serveur) ou supprimé n'est jamais ce message-là.
     */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId AND sendState IS NULL " +
            "AND serverId IS NOT NULL AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 1",
    )
    public suspend fun latestAcknowledged(conversationId: String): MessageEntity?

    @Query("SELECT * FROM messages WHERE conversationId = :conversationId")
    public suspend fun listForConversation(conversationId: String): List<MessageEntity>

    /**
     * The newest [limit] rows for a conversation, most-recent first — a
     * cache-only "peek" read (hard-press preview card) that never loads a
     * conversation's full history into memory.
     */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "ORDER BY createdAt DESC LIMIT :limit",
    )
    public suspend fun recentForConversation(conversationId: String, limit: Int): List<MessageEntity>

    /**
     * Observes a conversation's most recent [limit] rows, newest first — the
     * bounded counterpart to [observeForConversation] (#5189). The nominal
     * chat screen only needs a growing window of recent history: an
     * unbounded observe re-decodes the WHOLE conversation from SQLite on
     * every write (a reaction, a translation arriving, a read receipt),
     * however far back that history goes. Callers restore ascending order
     * themselves ([kotlin.collections.List.asReversed], the same convention
     * [recentForConversation]'s callers already use). [observeForConversation]
     * remains for legitimate full-history consumers.
     */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "ORDER BY createdAt DESC LIMIT :limit",
    )
    public fun observeRecentForConversation(conversationId: String, limit: Int): Flow<List<MessageEntity>>

    /**
     * INSERT IGNORE : n'écrit que les lignes dont l'identifiant est absent et ne remplace JAMAIS une ligne existante
     * (préchargement d'un push : jamais d'écrasement d'un payload riche). Rend le rowid de chaque ligne, `-1` pour une
     * ligne ignorée.
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    public suspend fun insertIfAbsent(rows: List<MessageEntity>): List<Long>

    @Upsert
    public suspend fun upsertAll(rows: List<MessageEntity>)

    @Query("SELECT * FROM messages WHERE id IN (:ids)")
    public suspend fun findAll(ids: List<String>): List<MessageEntity>

    /** Third level of the id lookup: a row whose primary key is still the local id but whose server id is known. */
    @Query("SELECT * FROM messages WHERE serverId = :serverId LIMIT 1")
    public suspend fun findByServerId(serverId: String): MessageEntity?

    /** Rows written before the queryable columns existed, oldest first, for the Kotlin backfill. */
    @Query("SELECT * FROM messages WHERE columnsBackfilled = 0 ORDER BY createdAt ASC LIMIT :limit")
    public suspend fun unbackfilled(limit: Int): List<MessageEntity>

    @Query("SELECT * FROM messages WHERE conversationId = :conversationId AND pinnedAt IS NOT NULL ORDER BY pinnedAt DESC")
    public suspend fun pinned(conversationId: String): List<MessageEntity>

    /** Ephemeral rows whose deadline has passed — what the retention sweep removes. */
    @Query("SELECT * FROM messages WHERE expiresAt IS NOT NULL AND expiresAt <= :nowMillis")
    public suspend fun expiredBefore(nowMillis: Long): List<MessageEntity>

    /**
     * The rows that may hold a view-once THIS reader opened: the opening column is set, or the payload says
     * `consumedByMe` (rows written before the column was derived on every write). The caller decides from the decoded
     * payload; a row stays a candidate after it is sealed, so the pass that reads this must be idempotent.
     */
    @Query("SELECT * FROM messages WHERE viewOnceOpenedAt IS NOT NULL OR payload LIKE '%\"consumedByMe\":true%'")
    public suspend fun openedViewOnceCandidates(): List<MessageEntity>

    /** The reader opened a view-once message: permanent, and invisible to a REST refresh. */
    @Query(
        "UPDATE messages SET viewOnceOpenedAt = :openedAt, changeVersion = changeVersion + 1 " +
            "WHERE id = :id AND viewOnceOpenedAt IS NULL",
    )
    public suspend fun markViewOnceOpened(id: String, openedAt: Long)

    @Query(
        "UPDATE messages SET sendState = :sendState, retryCount = :retryCount, lastError = :lastError, " +
            "changeVersion = changeVersion + 1 WHERE id = :id",
    )
    public suspend fun recordSendAttempt(id: String, sendState: String?, retryCount: Int, lastError: String?)

    @Query("SELECT COUNT(*) FROM messages WHERE columnsBackfilled = 0")
    public suspend fun countUnbackfilled(): Int

    /**
     * Prunes server rows absent from the latest sync. Optimistic local rows
     * (`sendState` non-null) are never pruned — the server does not know them yet.
     */
    @Query(
        "DELETE FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL AND id NOT IN (:ids)",
    )
    public suspend fun deleteMissing(conversationId: String, ids: List<String>)

    /**
     * Windowed prune for the newest-page sync: only server rows inside the
     * fetched window (`createdAt >= :minCreatedAt`) can be declared deleted by
     * their absence — older paginated history is outside the page and survives.
     */
    @Query(
        "DELETE FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL AND createdAt >= :minCreatedAt AND id NOT IN (:ids)",
    )
    public suspend fun deleteMissingSince(conversationId: String, minCreatedAt: Long, ids: List<String>)

    /** The rows [deleteMissing] would prune, read in the same transaction before it (#14655). */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL AND id NOT IN (:ids)",
    )
    public suspend fun missing(conversationId: String, ids: List<String>): List<MessageEntity>

    /** The rows [deleteMissingSince] would prune, read in the same transaction before it (#14655). */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL AND createdAt >= :minCreatedAt AND id NOT IN (:ids)",
    )
    public suspend fun missingSince(conversationId: String, minCreatedAt: Long, ids: List<String>): List<MessageEntity>

    /**
     * The rows of a window anchored on an old message (#14670), newest first: [fromMillis] to
     * [throughMillis], both included. The anchored counterpart of [observeRecentForConversation].
     */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "AND createdAt >= :fromMillis AND createdAt <= :throughMillis ORDER BY createdAt DESC",
    )
    public fun observeRangeForConversation(
        conversationId: String,
        fromMillis: Long,
        throughMillis: Long,
    ): Flow<List<MessageEntity>>

    /** Les [limit] lignes strictement plus anciennes que [createdAt], la plus récente d'abord : le côté ancien d'un saut. */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId AND createdAt < :createdAt " +
            "ORDER BY createdAt DESC LIMIT :limit",
    )
    public suspend fun olderThan(conversationId: String, createdAt: Long, limit: Int): List<MessageEntity>

    /** Les [limit] lignes strictement plus récentes que [createdAt], la plus ancienne d'abord : le côté récent d'un saut. */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId AND createdAt > :createdAt " +
            "ORDER BY createdAt ASC LIMIT :limit",
    )
    public suspend fun newerThan(conversationId: String, createdAt: Long, limit: Int): List<MessageEntity>

    /** Les lignes d'une recherche, la plus récente d'abord : le mode `Search(ids)` de la fenêtre. */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId AND id IN (:ids) ORDER BY createdAt DESC",
    )
    public fun observeByIds(conversationId: String, ids: List<String>): Flow<List<MessageEntity>>

    /**
     * Oldest server-acked row among the newest [limit] — the `before` cursor of the RECENT window
     * (#14670). The cache may hold an older island (a jump to an old message): paging from the
     * cache's global oldest would leap over the gap between the two.
     */
    @Query(
        "SELECT * FROM (SELECT * FROM messages WHERE conversationId = :conversationId " +
            "ORDER BY createdAt DESC LIMIT :limit) WHERE sendState IS NULL ORDER BY createdAt ASC LIMIT 1",
    )
    public suspend fun oldestSyncedAmongRecent(conversationId: String, limit: Int): MessageEntity?

    /** Oldest server-acked row at or after [fromMillis] — the `before` cursor of an anchored window. */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL AND createdAt >= :fromMillis ORDER BY createdAt ASC LIMIT 1",
    )
    public suspend fun oldestSyncedSince(conversationId: String, fromMillis: Long): MessageEntity?

    /** Oldest server-acked row — the `before` cursor for backwards pagination. */
    @Query(
        "SELECT * FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL ORDER BY createdAt ASC LIMIT 1",
    )
    public suspend fun oldestSynced(conversationId: String): MessageEntity?

    /**
     * The high-water mark for a conversation's SERVER-CONFIRMED messages — MAX
     * `createdAt` among rows with no pending `sendState` (#5206). An optimistic,
     * not-yet-acked row's `createdAt` is CLIENT-assigned, never a value the
     * forward-watermark gap backfill (`GET .../messages?after=`) may safely
     * resume from — same exclusion [deleteMissingSince] already applies.
     * `null` when the conversation has no synced messages yet, in which case
     * the caller falls back to the full recent-window sync.
     */
    @Query(
        "SELECT MAX(createdAt) FROM messages WHERE conversationId = :conversationId " +
            "AND sendState IS NULL",
    )
    public suspend fun newestSyncedCreatedAt(conversationId: String): Long?

    /** The ids of the local send bubbles in [sendState] (`SENDING` / `FAILED`) — the boot reconciliation's input. */
    @Query("SELECT id FROM messages WHERE sendState = :sendState")
    public suspend fun idsInSendState(sendState: String): List<String>

    /** Réveille les observateurs d'un message dont seule une ligne dédiée (traduction, transcription) a changé. */
    @Query("UPDATE messages SET changeVersion = changeVersion + 1 WHERE id = :id")
    public suspend fun bumpChangeVersion(id: String)

    @Query("UPDATE messages SET sendState = :sendState, changeVersion = changeVersion + 1 WHERE id = :id")
    public suspend fun updateSendState(id: String, sendState: String?)

    @Query("DELETE FROM messages WHERE id IN (:ids)")
    public suspend fun deleteByIds(ids: List<String>)

    @Query("DELETE FROM messages WHERE conversationId = :conversationId")
    public suspend fun clearConversation(conversationId: String)

    @Query("DELETE FROM messages")
    public suspend fun clear()

    /** Purge du cache : une page de charges, toutes lignes confondues (l'attribution des médias les relit). */
    @Query("SELECT payload FROM messages ORDER BY id LIMIT :limit OFFSET :offset")
    public suspend fun payloadPage(limit: Int, offset: Int): List<String>

    /** Octets réels des charges que la purge peut retirer : jamais une ligne optimiste ni une vue unique ouverte. */
    @Query("SELECT COALESCE(SUM(LENGTH(CAST(payload AS BLOB))), 0) FROM messages WHERE sendState IS NULL AND viewOnceOpenedAt IS NULL")
    public suspend fun purgeablePayloadBytes(): Long

    @Query("DELETE FROM messages WHERE sendState IS NULL AND viewOnceOpenedAt IS NULL")
    public suspend fun clearPurgeable()

    /** Rétention — les lignes confirmées par le serveur plus vieilles que [cutoff] (une ligne optimiste n'est jamais purgée). */
    @Query("SELECT id, serverId FROM messages WHERE sendState IS NULL AND createdAt < :cutoff LIMIT :limit")
    public suspend fun retentionKeysOlderThan(cutoff: Long, limit: Int): List<MessageKeys>

    /** Rétention — les éphémères confirmés dont l'échéance est passée. */
    @Query("SELECT id, serverId FROM messages WHERE sendState IS NULL AND expiresAt IS NOT NULL AND expiresAt <= :nowMillis LIMIT :limit")
    public suspend fun retentionKeysExpired(nowMillis: Long, limit: Int): List<MessageKeys>

    /** Rétention — toutes les clés d'un fil, pour purger une conversation entière sans orphelin. */
    @Query("SELECT id, serverId FROM messages WHERE conversationId = :conversationId")
    public suspend fun retentionKeysForConversation(conversationId: String): List<MessageKeys>

    /** Rétention — les fils qui dépassent [cap] lignes confirmées. */
    @Query("SELECT conversationId FROM messages WHERE sendState IS NULL GROUP BY conversationId HAVING COUNT(*) > :cap")
    public suspend fun conversationsOverCap(cap: Int): List<String>

    /** Rétention — les lignes confirmées au-delà des [keep] plus récentes d'un fil. */
    @Query(
        "SELECT id, serverId FROM messages WHERE conversationId = :conversationId AND sendState IS NULL " +
            "ORDER BY createdAt DESC LIMIT -1 OFFSET :keep",
    )
    public suspend fun retentionKeysBeyondNewest(conversationId: String, keep: Int): List<MessageKeys>
}

/** Les deux identifiants sous lesquels les tables filles peuvent référencer un message. */
public data class MessageKeys(val id: String, val serverId: String?)

/**
 * Upserts server-truth rows without erasing what only this device knows (retry counter, last
 * error, opened view-once, change version). Call it inside the transaction that writes the page.
 * The message ingestion pipeline (`MessageIngestPipeline`) goes further and skips unchanged rows.
 */
public suspend fun MessageDao.upsertKeepingLocal(rows: List<MessageEntity>) {
    if (rows.isEmpty()) return
    val previous = rows.map { it.id }.chunked(ID_CHUNK).flatMap { findAll(it) }.associateBy { it.id }
    upsertAll(rows.map { it.carryingLocalColumnsOf(previous[it.id]) })
}

/**
 * Whether this row stores exactly what [other] stores, ignoring the bookkeeping that every write
 * moves (`cachedAt`, `changeVersion`) — the test that decides whether an upsert is a real change.
 */
public fun MessageEntity.sameStoredContentAs(other: MessageEntity): Boolean =
    copy(cachedAt = other.cachedAt, changeVersion = other.changeVersion) == other

private const val ID_CHUNK = 500
