package me.meeshy.core.database.migration

import androidx.room.migration.Migration

/**
 * Toutes les données d'appel à venir en une seule montée : `call_history` gagne `participants` et `reactionCounts`
 * (vides pour les lignes déjà en cache, aucune n'est perdue), et les tables locales `call_network_journal` et
 * `call_transcript` arrivent vides.
 */
internal val Migration_26_27: Migration = object : Migration(26, 27) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `call_history` ADD COLUMN `participants` TEXT NOT NULL DEFAULT '[]'")
        db.execSQL("ALTER TABLE `call_history` ADD COLUMN `reactionCounts` TEXT NOT NULL DEFAULT '{}'")
        db.createCacheTable(CacheTables.callNetworkJournal)
        db.createCacheTable(CacheTables.callTranscript)
    }
}
