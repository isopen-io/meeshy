package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/** Adds the ephemeral receipts, edit revisions, address-book directory and media index tables. */
internal val Migration_16_17: Migration = object : Migration(16, 17) {
    override fun migrate(db: SupportSQLiteDatabase) {
        listOf(
            CacheTables.ephemeralReceipts,
            CacheTables.editRevisions,
            CacheTables.directoryContacts,
            CacheTables.mediaIndex,
        ).forEach(db::createCacheTable)
    }
}
