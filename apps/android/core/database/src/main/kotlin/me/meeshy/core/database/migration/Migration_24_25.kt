package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Le journal des tentatives d'envoi (`send_attempts`) : la fiche d'un message sortant liste chaque tentative avec son
 * transport et son issue. Purement additive : l'outbox, les messages et les autres caches ne sont pas touchés.
 */
internal val Migration_24_25: Migration = object : Migration(24, 25) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.createCacheTable(CacheTables.sendAttempts)
    }
}
