package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Adds the generic per-item list cache (`cache_entries`) and the keyed JSON document cache (`keyed_json_cache`). */
internal val Migration_17_18: Migration = object : Migration(17, 18) {
    override fun migrate(db: SupportSQLiteDatabase) {
        listOf(
            CacheTables.cacheEntries,
            CacheTables.keyedJsonCache,
        ).forEach(db::createCacheTable)
    }
}
