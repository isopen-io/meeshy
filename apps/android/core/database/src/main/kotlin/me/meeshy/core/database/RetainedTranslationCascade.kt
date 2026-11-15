package me.meeshy.core.database

import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Une traduction, une transcription ou une piste audio retenue ne survit JAMAIS à son message (miroir de
 * `MessageChildRows.delete`, iOS) — garanti par la base elle-même, quelle que soit la porte qui retire la ligne
 * (rétention, élagage de synchro, purge de conversation, « Vider le cache », `clearAllTables`, toute requête future).
 *
 * Une clé étrangère `ON DELETE CASCADE` est impossible : une ligne retenue est rangée sous l'id CANONIQUE du message,
 * qui est `messages.serverId` dès qu'il est connu, `messages.id` sinon. Un déclencheur `AFTER DELETE ON messages`
 * efface donc les lignes rangées sous l'un ou l'autre de ses deux ids, sauf si une AUTRE ligne de `messages` les porte
 * encore (la bulle optimiste remplacée par sa jumelle serveur). Comme l'index de recherche ([me.meeshy.core.database.search.SearchIndexSchema]),
 * il vit hors du schéma Room et s'installe à CHAQUE ouverture, avec un balayage des orphelins déjà présents.
 */
public object RetainedTranslationCascade {

    public const val TRIGGER: String = "messages_retained_translations_after_delete"

    public val tables: List<String> = listOf("message_translations", "message_transcriptions", "message_audio_translations")

    private fun unclaimed(table: String): String =
        "NOT EXISTS (SELECT 1 FROM `messages` WHERE `id` = `$table`.`messageId`) " +
            "AND NOT EXISTS (SELECT 1 FROM `messages` WHERE `serverId` = `$table`.`messageId`)"

    public val triggerSql: String =
        "CREATE TRIGGER `$TRIGGER` AFTER DELETE ON `messages` BEGIN " +
            tables.joinToString(" ") { table ->
                "DELETE FROM `$table` WHERE `messageId` IN (old.`id`, old.`serverId`) AND ${unclaimed(table)};"
            } +
            " END"

    public val sweepSql: List<String> = tables.map { table -> "DELETE FROM `$table` WHERE ${unclaimed(table)}" }

    /**
     * Réinstalle le déclencheur — supprimé puis recréé, pour qu'une définition plus récente remplace toujours
     * l'ancienne — et efface les orphelins qu'une version antérieure aurait laissés.
     */
    public fun ensure(db: SupportSQLiteDatabase) {
        db.execSQL("DROP TRIGGER IF EXISTS `$TRIGGER`")
        db.execSQL(triggerSql)
        sweepSql.forEach(db::execSQL)
    }

    /** À chaque ouverture : installation neuve, migration, remise à zéro des caches, base de test. */
    public val callback: RoomDatabase.Callback = object : RoomDatabase.Callback() {
        override fun onOpen(db: SupportSQLiteDatabase) {
            ensure(db)
        }
    }
}
