package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Les traductions, transcriptions et pistes audio traduites déjà reçues quittent la charge du message pour trois tables
 * dédiées, uniques par (message, langue). Purement additive : les messages, l'outbox et les autres caches ne sont pas touchés.
 */
internal val Migration_25_26: Migration = object : Migration(25, 26) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.createCacheTable(CacheTables.messageTranslations)
        db.createCacheTable(CacheTables.messageTranscriptions)
        db.createCacheTable(CacheTables.messageAudioTranslations)
    }
}
