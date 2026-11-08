package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * La liste des notifications devient persistante (`notifications`). Purement additive : l'outbox, les autres caches et
 * le reste de la base ne sont pas touchés.
 */
internal val Migration_23_24: Migration = object : Migration(23, 24) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.createCacheTable(CacheTables.notifications)
    }
}
