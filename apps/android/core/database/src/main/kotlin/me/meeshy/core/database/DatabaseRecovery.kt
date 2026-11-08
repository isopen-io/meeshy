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
import androidx.sqlite.db.SupportSQLiteDatabase
import java.io.File
import java.io.FileOutputStream
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.core.database.crypto.DatabaseFileState
import me.meeshy.core.database.crypto.DatabaseFileStates
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

/** Une base ouverte en lecture seule pour le sauvetage : il n'y lit que des `SELECT`. */
public interface SalvageConnection : java.io.Closeable {
    public fun query(sql: String): Cursor
}

/**
 * Ouvre en lecture seule la base dont on sauve les lignes. La base principale est chiffrée par SQLCipher : seul un ouvreur
 * qui détient sa clé la relit ([DatabaseRecovery.byFileState]) ; le framework n'y verrait qu'un fichier illisible.
 */
public fun interface SalvageOpener {
    public fun open(database: File): SalvageConnection
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
     * Le marqueur posé à côté de [database] quand SQLite y signale une corruption en cours d'usage : la sonde ne lit que
     * le catalogue et Room que `room_master_table`, donc une page abîmée de `messages` laisserait la base s'ouvrir
     * « normalement » à chaque lancement, et la même requête échouer à chaque fois.
     */
    public fun corruptionMarker(database: File): File = File(database.path + CORRUPTION_MARKER_SUFFIX)

    /**
     * Pose le marqueur de corruption de [database], hors SQLite et de façon atomique (fichier temporaire synchronisé puis
     * renommé). Ne lève jamais : rend `false` si le disque l'a refusé.
     */
    public fun markCorrupted(database: File): Boolean {
        val marker = corruptionMarker(database)
        val pending = File(marker.path + ".tmp")
        return try {
            FileOutputStream(pending).use { out ->
                out.write(System.currentTimeMillis().toString().toByteArray())
                out.fd.sync()
            }
            pending.renameTo(marker) || marker.exists()
        } catch (_: Exception) {
            false
        } finally {
            pending.delete()
        }
    }

    public fun isMarkedCorrupted(database: File): Boolean = corruptionMarker(database).exists()

    public fun clearCorruptionMarker(database: File): Boolean = corruptionMarker(database).delete()

    /**
     * Efface le marqueur de corruption de [db] s'il est périmé : après une purge de session (`clearAllTables` finit par
     * un `VACUUM`, qui réécrit le fichier), `PRAGMA quick_check` peut le trouver sain, et une réparation au lancement
     * suivant ne ferait que vider le cache du compte suivant. Le marqueur reste au moindre doute (contrôle qui échoue ou
     * qui rapporte une erreur). Rend `true` si le marqueur a été effacé.
     */
    public fun clearStaleCorruptionMarker(db: SupportSQLiteDatabase): Boolean {
        val path = db.path?.takeUnless { it.isBlank() || it == IN_MEMORY_PATH } ?: return false
        val file = File(path)
        if (!isMarkedCorrupted(file)) return false
        val healthy = try {
            db.query("PRAGMA quick_check").use { cursor ->
                buildList { while (cursor.moveToNext()) add(cursor.getString(0)) } == listOf("ok")
            }
        } catch (_: Exception) {
            false
        }
        return healthy && clearCorruptionMarker(file)
    }

    /** L'ouvreur du framework : bases en clair (base de repli d'un lancement antérieur, base d'avant le chiffrement). */
    public val frameworkSalvage: SalvageOpener = SalvageOpener { file ->
        val db = openReadOnly(file)
        object : SalvageConnection {
            override fun query(sql: String): Cursor = db.rawQuery(sql, null)
            override fun close() = db.close()
        }
    }

    /**
     * Choisit l'ouvreur d'après l'en-tête du fichier : une base encore en clair (migration qui a échoué sur une page
     * abîmée) se relit par le framework, toute autre par [encrypted], qui détient la clé SQLCipher.
     */
    public fun byFileState(encrypted: SalvageOpener): SalvageOpener = SalvageOpener { file ->
        if (DatabaseFileStates.of(file) == DatabaseFileState.PLAINTEXT) frameworkSalvage.open(file) else encrypted.open(file)
    }

    /** [database] en lecture-écriture, avec un gestionnaire d'erreurs inerte ; `null` si elle ne s'ouvre pas. */
    public fun openWritable(database: File): SQLiteDatabase? =
        try {
            SQLiteDatabase.openDatabase(database.path, null, SQLiteDatabase.OPEN_READWRITE, DatabaseErrorHandler { })
        } catch (_: SQLiteException) {
            null
        }

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

    /**
     * Tout ce qui se sauve de [database], chaque table lue indépendamment : une table illisible n'emporte pas les autres.
     * [opener] ouvre le fichier : le framework par défaut, l'ouvreur SQLCipher pour la base principale chiffrée.
     */
    public fun salvage(database: File, opener: SalvageOpener = frameworkSalvage): DatabaseSalvage = DatabaseSalvage(
        outbox = salvageOutbox(database, opener),
        plaintextErasures = salvagePlaintextErasures(database, opener),
        pendingIds = salvagePendingIds(database, opener),
    )

    /**
     * Les clairs E2EE que le coffre doit encore retirer (#14655), acquittés compris : le coffre survit à la base, et une
     * inscription perdue laisserait le clair d'un message effacé dans le coffre pour toujours.
     */
    public fun salvagePlaintextErasures(
        database: File,
        opener: SalvageOpener = frameworkSalvage,
    ): List<PlaintextErasureEntity> =
        readRows(database, "e2ee_plaintext_erasures", opener) { row ->
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
    public fun salvagePendingIds(database: File, opener: SalvageOpener = frameworkSalvage): List<PendingIdEntity> =
        readRows(database, "pending_ids", opener) { row ->
            PendingIdEntity(
                localId = row.text("localId") ?: return@readRows null,
                serverId = row.text("serverId") ?: return@readRows null,
                conversationId = row.text("conversationId").orEmpty(),
                reconciledAt = row.number("reconciledAt"),
            )
        }

    /**
     * Les copies laissées par une reprise : `<base>.corrupted.<ts>*`, la base de repli, et les marqueurs de corruption.
     * Les copies portent l'historique du compte qui les a écrites (en clair pour celles d'avant le chiffrement ou d'une
     * base de repli antérieure) : elles quittent l'appareil avec la session.
     */
    public fun leftovers(primary: File, secondary: File): List<File> =
        quarantined(primary) + listOf(corruptionMarker(primary)).filter { it.exists() } + fallbackFiles(secondary)

    /**
     * Supprime [leftovers], sauf les fichiers de la base [inUse] : on ne retire pas un fichier sous SQLite, et son marqueur
     * de corruption, qui ne porte aucune donnée, doit encore armer la réparation du lancement suivant.
     */
    public fun deleteLeftovers(primary: File, secondary: File, inUse: File? = null): List<File> {
        val kept = inUse?.let { fallbackPaths(it) }.orEmpty().map { it.absolutePath }.toSet()
        return leftovers(primary, secondary)
            .filterNot { it.absolutePath in kept }
            .filter { it.delete() }
    }

    /**
     * Garde au plus [keep] quarantaines, les plus récentes (horodatage du nom) ; supprime les plus anciennes avec leurs
     * fichiers compagnons. Rend les fichiers effectivement retirés.
     */
    public fun pruneQuarantines(primary: File, keep: Int): List<File> {
        val prefix = "${primary.name}.corrupted."
        val byStamp = quarantined(primary).groupBy { it.name.removePrefix(prefix).takeWhile(Char::isDigit).toLongOrNull() ?: -1L }
        return byStamp.keys.sortedDescending().drop(keep).flatMap(byStamp::getValue).filter { it.delete() }
    }

    /**
     * Supprime les quarantaines EN CLAIR de [primary] (copie d'une base d'avant le chiffrement, ou d'une base en clair
     * abîmée que la migration n'a pas pu exporter) avec leurs fichiers compagnons : elles portent l'historique en clair, et
     * le chiffrement au repos ne vaut rien tant qu'elles restent. Un groupe sans copie principale (journal orphelin) part
     * aussi : rien ne le relit, et un journal WAL en clair porte des pages en clair. Les quarantaines chiffrées restent.
     */
    public fun deletePlaintextQuarantines(primary: File): List<File> {
        val prefix = "${primary.name}.corrupted."
        val byStamp = quarantined(primary).groupBy { it.name.removePrefix(prefix).takeWhile(Char::isDigit) }
        return byStamp.values
            .filter { group ->
                val copy = group.firstOrNull { it.name.removePrefix(prefix).all(Char::isDigit) }
                copy == null || DatabaseFileStates.of(copy) == DatabaseFileState.PLAINTEXT
            }
            .flatten()
            .filter { it.delete() }
    }

    /** Supprime la base de repli et ses fichiers compagnons. */
    public fun deleteFallback(secondary: File): List<File> = fallbackFiles(secondary).filter { it.delete() }

    private fun quarantined(primary: File): List<File> =
        primary.parentFile
            ?.listFiles()
            .orEmpty()
            .filter { it.name.startsWith("${primary.name}.corrupted.") }

    private fun fallbackPaths(database: File): List<File> =
        SIDE_SUFFIXES.map { File(database.path + it) } + corruptionMarker(database)

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
            failure.javaClass.simpleName == "SQLiteDatabaseCorruptException" ||
            (isSqliteFailure(failure) && CORRUPTION_CODES.any { failure.message.orEmpty().contains(it, ignoreCase = true) })

    private fun isUnavailable(failure: Throwable): Boolean =
        failure is SQLiteFullException ||
            failure is SQLiteDiskIOException ||
            failure is SQLiteCantOpenDatabaseException ||
            failure is SQLiteReadOnlyDatabaseException ||
            failure is SQLiteAccessPermException ||
            failure is SQLiteDatabaseLockedException ||
            failure is java.io.IOException ||
            (isCipherException(failure) && failure.javaClass.simpleName in CIPHER_UNAVAILABLE)

    /** SQLCipher lève ses propres exceptions (`net.zetetic.database.sqlcipher`), sans lien avec celles du framework. */
    private fun isCipherException(failure: Throwable): Boolean = failure.javaClass.name.startsWith(CIPHER_PACKAGE)

    private fun isSqliteFailure(failure: Throwable): Boolean = failure is SQLiteException || isCipherException(failure)

    private class Row(private val cursor: Cursor) {
        fun text(name: String): String? =
            cursor.getColumnIndex(name).takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getString)

        fun number(name: String): Long? =
            cursor.getColumnIndex(name).takeIf { it >= 0 && !cursor.isNull(it) }?.let(cursor::getLong)
    }

    /** SQLCipher lève ses propres exceptions et une clé absente lève avant SQLite : tout échec rend une liste vide. */
    private fun <T : Any> readRows(database: File, table: String, opener: SalvageOpener, map: (Row) -> T?): List<T> {
        if (!database.exists()) return emptyList()
        return try {
            opener.open(database).use { db ->
                db.query("SELECT * FROM $table").use { cursor ->
                    val row = Row(cursor)
                    buildList { while (cursor.moveToNext()) map(row)?.let { add(it) } }
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Relit les envois en attente d'une base qu'on s'apprête à mettre de côté. Lecture seule, tolérante : une table
     * absente ou illisible rend une liste vide, jamais une exception.
     */
    public fun salvageOutbox(database: File, opener: SalvageOpener = frameworkSalvage): List<OutboxEntity> =
        readRows(database, "outbox", opener) { row ->
            OutboxEntity(
                cmid = row.text("cmid") ?: return@readRows null,
                lane = row.text("lane") ?: return@readRows null,
                kind = row.text("kind") ?: return@readRows null,
                targetId = row.text("targetId").orEmpty(),
                payload = row.text("payload").orEmpty(),
                dependsOn = row.text("dependsOn"),
                attempts = row.number("attempts")?.toInt() ?: 0,
                state = row.text("state") ?: "PENDING",
                createdAt = row.number("createdAt") ?: 0L,
                updatedAt = row.number("updatedAt") ?: 0L,
                nextAttemptAt = row.number("nextAttemptAt"),
                lastError = row.text("lastError"),
                waitingSince = row.number("waitingSince"),
                cancelRequestedAt = row.number("cancelRequestedAt"),
                ownerId = row.text("ownerId"),
            )
        }

    /** Une exception d'ouverture qui relève d'un fichier abîmé ou d'un disque qui refuse, plutôt que d'un bug de code. */
    public fun isStorageFailure(failure: Throwable): Boolean = classify(failure) != OpenFailureKind.DEFECT

    public const val CORRUPTION_MARKER_SUFFIX: String = ".corruption-detected"

    /** Le chemin que SQLite donne à une base en mémoire : elle n'a ni fichier ni marqueur. */
    public const val IN_MEMORY_PATH: String = ":memory:"

    private const val MAX_CAUSES = 8

    private val CORRUPTION_CODES = listOf("SQLITE_CORRUPT", "SQLITE_NOTADB", "file is not a database")

    private const val CIPHER_PACKAGE = "net.zetetic.database"

    private val CIPHER_UNAVAILABLE = setOf(
        "SQLiteFullException", "SQLiteDiskIOException", "SQLiteCantOpenDatabaseException",
        "SQLiteReadOnlyDatabaseException", "SQLiteAccessPermException", "SQLiteDatabaseLockedException",
    )
}
