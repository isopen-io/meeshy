package me.meeshy.core.database.migration

import androidx.room.migration.Migration

/**
 * Les mesures en attente (comptages, événements sociaux v2) et le cache des liens de suivi : trois tables locales
 * neuves, vides à l'arrivée, créées d'emblée avec leur clé (compte, événement) : rien à reconstruire. Aucune ligne
 * existante n'est touchée.
 */
internal val Migration_27_28: Migration = object : Migration(27, 28) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.createCacheTable(CacheTables.pendingCountingEvents)
        db.createCacheTable(CacheTables.socialEventsV2Outbox)
        db.createCacheTable(CacheTables.trackingLinksCache)
    }
}
