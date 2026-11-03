package me.meeshy.core.database

import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteConstraintException
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import java.io.File
import me.meeshy.core.database.entity.OutboxEntity

/** Les gestes de reprise sur une base illisible : mise en quarantaine des fichiers, sauvetage de l'outbox. */
public object DatabaseRecovery {
    private val SIDE_SUFFIXES = listOf("", "-wal", "-shm", "-journal")

    /**
     * Renomme la base et ses fichiers compagnons en `<nom>.corrupted.<ts>[<suffixe>]` : rien n'est détruit, un support
     * peut les récupérer. Rend les fichiers déplacés ; ceux qui n'existent pas sont ignorés.
     */
    public fun quarantine(database: File, atMillis: Long): List<File> =
        SIDE_SUFFIXES.mapNotNull { suffix ->
            val source = File(database.path + suffix)
            if (!source.exists()) return@mapNotNull null
            val target = File("${database.path}.corrupted.$atMillis$suffix")
            if (source.renameTo(target)) target else {
                source.delete()
                null
            }
        }

    /**
     * Le gestionnaire d'erreurs par défaut du framework SUPPRIME le fichier à la première corruption : on le remplace
     * par un gestionnaire inerte, car la quarantaine doit pouvoir le déplacer.
     */
    private fun openReadOnly(database: File): SQLiteDatabase =
        SQLiteDatabase.openDatabase(database.path, null, SQLiteDatabase.OPEN_READONLY, DatabaseErrorHandler { })

    /** Le fichier s'ouvre et son catalogue se lit : un en-tête ou une page racine corrompus échouent ici. */
    public fun isReadable(database: File): Boolean {
        if (!database.exists()) return true
        return try {
            openReadOnly(database).use { db ->
                db.rawQuery("SELECT count(*) FROM sqlite_master", null).use { it.moveToFirst() }
            }
            true
        } catch (_: SQLiteException) {
            false
        }
    }

    /**
     * Relit les envois en attente d'une base qu'on s'apprête à mettre de côté. Lecture seule, tolérante : une table
     * absente ou illisible rend une liste vide, jamais une exception.
     */
    public fun salvageOutbox(database: File): List<OutboxEntity> {
        if (!database.exists()) return emptyList()
        return try {
            openReadOnly(database).use { db ->
                db.rawQuery("SELECT * FROM outbox", null).use { cursor ->
                    val rows = ArrayList<OutboxEntity>()
                    while (cursor.moveToNext()) {
                        fun text(name: String): String? =
                            cursor.getColumnIndex(name).takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getString)
                        fun number(name: String): Long? =
                            cursor.getColumnIndex(name).takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getLong)
                        val cmid = text("cmid") ?: continue
                        rows += OutboxEntity(
                            cmid = cmid,
                            lane = text("lane") ?: continue,
                            kind = text("kind") ?: continue,
                            targetId = text("targetId").orEmpty(),
                            payload = text("payload").orEmpty(),
                            dependsOn = text("dependsOn"),
                            attempts = number("attempts")?.toInt() ?: 0,
                            state = text("state") ?: "PENDING",
                            createdAt = number("createdAt") ?: 0L,
                            updatedAt = number("updatedAt") ?: 0L,
                            nextAttemptAt = number("nextAttemptAt"),
                            lastError = text("lastError"),
                            waitingSince = number("waitingSince"),
                            cancelRequestedAt = number("cancelRequestedAt"),
                            ownerId = text("ownerId"),
                        )
                    }
                    rows
                }
            }
        } catch (_: SQLiteException) {
            emptyList()
        }
    }

    /** Une exception d'ouverture qui relève d'un fichier abîmé ou d'un disque plein plutôt que d'un bug de code. */
    public fun isStorageFailure(failure: Throwable): Boolean =
        failure is SQLiteException && failure !is SQLiteConstraintException ||
            failure is IllegalStateException ||
            failure is java.io.IOException
}
