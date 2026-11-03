package me.meeshy.core.database

import android.database.Cursor
import android.database.DatabaseErrorHandler
import android.database.sqlite.SQLiteAccessPermException
import android.database.sqlite.SQLiteCantOpenDatabaseException
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteDatabaseCorruptException
import android.database.sqlite.SQLiteDatabaseLockedException
import android.database.sqlite.SQLiteDiskIOException
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteFullException
import android.database.sqlite.SQLiteReadOnlyDatabaseException
import java.io.File
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity

/**
 * Ce qu'un échec d'ouverture dit du fichier :
 * - [CORRUPTION] : le fichier est abîmé, il part en quarantaine et la base est recréée ;
 * - [UNAVAILABLE] : le disque refuse (plein, E/S, droits, verrou) — le fichier n'est pas en cause, il reste en place et
 *   l'app se replie ailleurs le temps de ce lancement ;
 * - [DEFECT] : un bug de code (migration absente ou fautive, schéma incohérent) — rien n'est déplacé ni vidé, l'échec
 *   remonte.
 */
public enum class OpenFailureKind { CORRUPTION, UNAVAILABLE, DEFECT }

/** Ce qu'on sauve d'une base qu'on met de côté : les envois en attente, les clairs E2EE à effacer, les identifiants en attente. */
public data class DatabaseSalvage(
    val outbox: List<OutboxEntity> = emptyList(),
    val plaintextErasures: List<PlaintextErasureEntity> = emptyList(),
    val pendingIds: List<PendingIdEntity> = emptyList(),
) {
    val isEmpty: Boolean get() = outbox.isEmpty() && plaintextErasures.isEmpty() && pendingIds.isEmpty()
}

/** Les gestes de reprise sur une base illisible : mise en quarantaine des fichiers, sauvetage de ce qui ne se refait pas. */
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

    /**
     * Le fichier s'ouvre et son catalogue se lit : un en-tête ou une page racine corrompus échouent ici. SEULE une vraie
     * corruption ([OpenFailureKind.CORRUPTION] : `SQLITE_CORRUPT`, `SQLITE_NOTADB`) rend `false`. Un disque plein, une
     * erreur d'E/S, un verrou, une mémoire saturée ou tout autre échec ne prouvent rien contre le fichier : il est réputé
     * lisible, et l'ouverture tranchera — jamais une quarantaine pour un échec passager.
     */
    public fun isReadable(database: File, open: (File) -> SQLiteDatabase = ::openReadOnly): Boolean {
        if (!database.exists()) return true
        return try {
            open(database).use { db ->
                db.rawQuery("SELECT count(*) FROM sqlite_master", null).use { it.moveToFirst() }
            }
            true
        } catch (failure: SQLiteException) {
            classify(failure) != OpenFailureKind.CORRUPTION
        }
    }

    /** Tout ce qui se sauve de [database], chaque table lue indépendamment : une table illisible n'emporte pas les autres. */
    public fun salvage(database: File): DatabaseSalvage = DatabaseSalvage(
        outbox = salvageOutbox(database),
        plaintextErasures = salvagePlaintextErasures(database),
        pendingIds = salvagePendingIds(database),
    )

    /**
     * Les clairs E2EE que le coffre doit encore retirer (#14655), acquittés compris : le coffre survit à la base, et une
     * inscription perdue laisserait le clair d'un message effacé dans le coffre pour toujours.
     */
    public fun salvagePlaintextErasures(database: File): List<PlaintextErasureEntity> =
        readRows(database, "e2ee_plaintext_erasures") { row ->
            PlaintextErasureEntity(
                account = row.text("account") ?: return@readRows null,
                kind = row.text("kind") ?: return@readRows null,
                itemId = row.text("itemId") ?: return@readRows null,
                clientMessageId = row.text("clientMessageId"),
                senderId = row.text("senderId"),
                recordedAt = row.number("recordedAt") ?: 0L,
                acknowledgedAt = row.number("acknowledgedAt"),
            )
        }

    /** Les ponts `cid_` → identifiant serveur : sans eux, l'écho socket d'un envoi récupéré crée une bulle en double. */
    public fun salvagePendingIds(database: File): List<PendingIdEntity> =
        readRows(database, "pending_ids") { row ->
            PendingIdEntity(
                localId = row.text("localId") ?: return@readRows null,
                serverId = row.text("serverId") ?: return@readRows null,
                conversationId = row.text("conversationId").orEmpty(),
                reconciledAt = row.number("reconciledAt"),
            )
        }

    /**
     * Les copies laissées par une reprise : `<base>.corrupted.<ts>*` et la base de repli. Elles ne sont pas chiffrées et
     * portent l'historique du compte qui les a écrites : elles quittent l'appareil avec la session.
     */
    public fun leftovers(primary: File, secondary: File): List<File> = quarantined(primary) + fallbackFiles(secondary)

    /** Supprime [leftovers], sauf les fichiers de la base [inUse] (ouverte : on ne retire pas un fichier sous SQLite). */
    public fun deleteLeftovers(primary: File, secondary: File, inUse: File? = null): List<File> {
        val kept = inUse?.let { fallbackPaths(it) }.orEmpty().map { it.absolutePath }.toSet()
        return leftovers(primary, secondary)
            .filterNot { it.absolutePath in kept }
            .filter { it.delete() }
    }

    /** Supprime la base de repli et ses fichiers compagnons. */
    public fun deleteFallback(secondary: File): List<File> = fallbackFiles(secondary).filter { it.delete() }

    private fun quarantined(primary: File): List<File> =
        primary.parentFile
            ?.listFiles()
            .orEmpty()
            .filter { it.name.startsWith("${primary.name}.corrupted.") }

    private fun fallbackPaths(database: File): List<File> = SIDE_SUFFIXES.map { File(database.path + it) }

    private fun fallbackFiles(secondary: File): List<File> = fallbackPaths(secondary).filter { it.exists() }

    /** La nature d'un échec d'ouverture, lue sur toute la chaîne des causes (Room et le framework en emballent certains). */
    public fun classify(failure: Throwable): OpenFailureKind {
        val chain = generateSequence(failure) { current -> current.cause?.takeIf { it !== current } }.take(MAX_CAUSES).toList()
        return when {
            chain.any(::isCorruption) -> OpenFailureKind.CORRUPTION
            chain.any(::isUnavailable) -> OpenFailureKind.UNAVAILABLE
            else -> OpenFailureKind.DEFECT
        }
    }

    /** `SQLITE_CORRUPT` (et ses codes étendus) ou `SQLITE_NOTADB`, quelle que soit la classe qui les porte. */
    private fun isCorruption(failure: Throwable): Boolean =
        failure is SQLiteDatabaseCorruptException ||
            (failure is SQLiteException && CORRUPTION_CODES.any { failure.message.orEmpty().contains(it) })

    private fun isUnavailable(failure: Throwable): Boolean =
        failure is SQLiteFullException ||
            failure is SQLiteDiskIOException ||
            failure is SQLiteCantOpenDatabaseException ||
            failure is SQLiteReadOnlyDatabaseException ||
            failure is SQLiteAccessPermException ||
            failure is SQLiteDatabaseLockedException ||
            failure is java.io.IOException

    private class Row(private val cursor: Cursor) {
        fun text(name: String): String? =
            cursor.getColumnIndex(name).takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getString)

        fun number(name: String): Long? =
            cursor.getColumnIndex(name).takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getLong)
    }

    private fun <T : Any> readRows(database: File, table: String, map: (Row) -> T?): List<T> {
        if (!database.exists()) return emptyList()
        return try {
            openReadOnly(database).use { db ->
                db.rawQuery("SELECT * FROM $table", null).use { cursor ->
                    val row = Row(cursor)
                    buildList { while (cursor.moveToNext()) map(row)?.let { add(it) } }
                }
            }
        } catch (_: SQLiteException) {
            emptyList()
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

    /** Une exception d'ouverture qui relève d'un fichier abîmé ou d'un disque qui refuse, plutôt que d'un bug de code. */
    public fun isStorageFailure(failure: Throwable): Boolean = classify(failure) != OpenFailureKind.DEFECT

    private const val MAX_CAUSES = 8

    private val CORRUPTION_CODES = listOf("SQLITE_CORRUPT", "SQLITE_NOTADB")
}
