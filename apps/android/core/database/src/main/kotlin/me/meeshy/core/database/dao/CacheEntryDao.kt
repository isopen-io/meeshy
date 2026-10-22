package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.CacheEntryEntity

/** What the differential write needs to know about a stored row, without reading its payload. */
public data class CacheEntryIndexRow(
    val itemId: String,
    val position: Int,
    val contentHash: String,
)

@Dao
public abstract class CacheEntryDao {

    @Query(
        "SELECT * FROM cache_entries WHERE namespace = :namespace AND `key` = :key AND itemId != '' ORDER BY position",
    )
    public abstract suspend fun items(namespace: String, key: String): List<CacheEntryEntity>

    @Query(
        "SELECT * FROM cache_entries WHERE namespace = :namespace AND `key` = :key AND itemId != '' ORDER BY position",
    )
    public abstract fun observeItems(namespace: String, key: String): Flow<List<CacheEntryEntity>>

    @Query("SELECT * FROM cache_entries WHERE namespace = :namespace AND `key` = :key AND itemId = ''")
    public abstract suspend fun meta(namespace: String, key: String): CacheEntryEntity?

    @Query("SELECT * FROM cache_entries WHERE namespace = :namespace AND `key` = :key AND itemId = ''")
    public abstract fun observeMeta(namespace: String, key: String): Flow<CacheEntryEntity?>

    @Query(
        "SELECT itemId, position, contentHash FROM cache_entries " +
            "WHERE namespace = :namespace AND `key` = :key AND itemId != ''",
    )
    public abstract suspend fun index(namespace: String, key: String): List<CacheEntryIndexRow>

    @Upsert
    public abstract suspend fun upsert(rows: List<CacheEntryEntity>)

    @Query("DELETE FROM cache_entries WHERE namespace = :namespace AND `key` = :key AND itemId IN (:itemIds)")
    public abstract suspend fun deleteItems(namespace: String, key: String, itemIds: List<String>)

    @Query("UPDATE cache_entries SET position = :position WHERE namespace = :namespace AND `key` = :key AND itemId = :itemId")
    public abstract suspend fun move(namespace: String, key: String, itemId: String, position: Int)

    @Query("DELETE FROM cache_entries WHERE namespace = :namespace AND `key` = :key")
    public abstract suspend fun deleteKey(namespace: String, key: String)

    @Query("DELETE FROM cache_entries WHERE namespace = :namespace")
    public abstract suspend fun deleteNamespace(namespace: String)

    @Query("SELECT COUNT(*) FROM cache_entries WHERE namespace = :namespace AND itemId != ''")
    public abstract suspend fun itemCount(namespace: String): Int

    /**
     * Applies a differential write atomically: [deletes] leave, [upserts] are written (rows that are
     * new or whose hash changed), [moves] only get a new rank, then the metadata row [meta] is
     * stored. Unchanged rows are not named at all, so they are not rewritten.
     */
    @Transaction
    public open suspend fun apply(
        namespace: String,
        key: String,
        deletes: List<String>,
        upserts: List<CacheEntryEntity>,
        moves: Map<String, Int>,
        meta: CacheEntryEntity?,
    ) {
        deletes.chunked(SQLITE_VARIABLE_BUDGET).forEach { deleteItems(namespace, key, it) }
        if (upserts.isNotEmpty()) upsert(upserts)
        moves.forEach { (itemId, position) -> move(namespace, key, itemId, position) }
        if (meta != null) upsert(listOf(meta))
    }
}

private const val SQLITE_VARIABLE_BUDGET = 500
