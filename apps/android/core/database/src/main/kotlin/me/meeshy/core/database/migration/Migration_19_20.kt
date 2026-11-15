package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Gives `messages` its queryable and local columns and creates `pending_ids`. Rows written before
 * the migration keep `columnsBackfilled = 0`: the Kotlin backfill derives their columns from the
 * payload after startup (no `json_extract`, no long migration on the main thread).
 */
internal val Migration_19_20: Migration = object : Migration(19, 20) {
    override fun migrate(db: SupportSQLiteDatabase) {
        CacheTables.messageColumnsAddedIn20.forEach { column -> db.execSQL("ALTER TABLE `messages` ADD COLUMN $column") }
        CacheTables.messagesIndexes.forEach(db::execSQL)
        db.createCacheTable(CacheTables.pendingIds)
    }
}
