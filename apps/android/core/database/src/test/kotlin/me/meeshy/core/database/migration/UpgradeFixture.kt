package me.meeshy.core.database.migration

import androidx.sqlite.db.SupportSQLiteDatabase
import me.meeshy.core.database.search.SearchIndexSchema

internal const val TEST_DB = "migration-test.db"

/** The ten columns `outbox` had at v16: later versions append nullable columns, never reorder these. */
internal const val V16_OUTBOX_COLUMNS: String =
    "(cmid, lane, kind, targetId, payload, dependsOn, attempts, state, createdAt, updatedAt)"

/** Rows written by the v16 build: the only copy of the user's queued work. */
internal fun SupportSQLiteDatabase.seedV16() {
    execSQL("INSERT INTO outbox $V16_OUTBOX_COLUMNS VALUES ('c1','message:conv1','SEND_MESSAGE','t1','{\"text\":\"salut\"}',NULL,0,'PENDING',10,10)")
    execSQL("INSERT INTO outbox $V16_OUTBOX_COLUMNS VALUES ('c2','message:conv1','SEND_MESSAGE','t2','{\"text\":\"encore\"}','c1',2,'INFLIGHT',11,12)")
    execSQL("INSERT INTO media_blob VALUES ('c3', X'0001FF7F80', 'a.jpg', 'image/jpeg', 13)")
    execSQL("INSERT INTO tus_upload_checkpoint VALUES ('k1','https://up/1',4096,9000,14)")
    execSQL("INSERT INTO sync_meta VALUES ('conversations',15,16,'\"etag\"','full')")
    execSQL("INSERT INTO messages (id, conversationId, seq, payload, createdAt, cachedAt, sendState) VALUES ('m1','conv1',1,'{\"id\":\"m1\"}',17,18,'SENT')")
    execSQL("INSERT INTO conversations VALUES ('conv1','{\"id\":\"conv1\"}',19,20,3)")
}

internal fun SupportSQLiteDatabase.rows(sql: String): List<List<String?>> =
    query(sql).use { cursor ->
        generateSequence { if (cursor.moveToNext()) cursor else null }
            .map { row ->
                (0 until row.columnCount).map { index ->
                    when (row.getType(index)) {
                        android.database.Cursor.FIELD_TYPE_NULL -> null
                        android.database.Cursor.FIELD_TYPE_BLOB -> row.getBlob(index).joinToString("") { "%02x".format(it) }
                        else -> row.getString(index)
                    }
                }
            }
            .toList()
    }

internal val DURABLE_QUERIES: List<String> = listOf(
    "SELECT * FROM outbox ORDER BY cmid",
    "SELECT * FROM media_blob ORDER BY cmid",
    "SELECT * FROM tus_upload_checkpoint ORDER BY checkpointKey",
    "SELECT * FROM sync_meta ORDER BY resourceKey",
)

/** [DURABLE_QUERIES] read through the v16 columns, to compare a v16 snapshot with any later version. */
internal val V16_DURABLE_QUERIES: List<String> = DURABLE_QUERIES.map {
    it.replace("SELECT * FROM outbox", "SELECT ${V16_OUTBOX_COLUMNS.removeSurrounding("(", ")")} FROM outbox")
}

/** Every table of the database except SQLite's and Room's own bookkeeping. */
internal fun SupportSQLiteDatabase.userTables(): Set<String> =
    rows("SELECT name FROM sqlite_master WHERE type = 'table'").flatten().filterNotNull()
        .filterNot { it.startsWith("sqlite_") || it.startsWith("android_") || it == "room_master_table" }
        .toSet()

/**
 * The dropped-table check of `runMigrationsAndValidate(validateDroppedTables = true)`, minus the
 * search index: Room's helper flags `message_fts` as unexpected because the index is raw SQL by
 * design (SearchIndexSchema), not a Room entity. Any other table outside the classified schema fails.
 */
internal fun SupportSQLiteDatabase.strayTables(): List<String> =
    (userTables() - DurableTables.names - CacheTables.names).filterNot(SearchIndexSchema::owns).sorted()
