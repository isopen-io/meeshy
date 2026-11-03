package me.meeshy.core.database

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import kotlinx.coroutines.CancellationException
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity

/** Où vit la base : un nom (relatif au dossier des bases, ou chemin absolu) ou la mémoire. */
public sealed interface DatabaseLocation {
    public data class Named(val name: String) : DatabaseLocation
    public data object Memory : DatabaseLocation
}

/**
 * Ouvre la base sans JAMAIS lever pour cause de fichier abîmé ou de disque qui refuse (iOS `ResilientDatabaseQueue`), et
 * sans JAMAIS masquer un bug de code :
 * 1. fichier CORROMPU ([OpenFailureKind.CORRUPTION], ou corruption signalée en cours d'usage par un lancement précédent :
 *    [DatabaseRecovery.isMarkedCorrupted]) : outbox, clairs E2EE à effacer et identifiants en attente sauvés en
 *    lecture seule, fichiers mis en quarantaine (`.corrupted.<ts>`, [MAX_QUARANTINES] au plus), base recréée, ce qui a
 *    été sauvé réinjecté ;
 * 2. disque qui refuse ([OpenFailureKind.UNAVAILABLE]), ou recréation impossible : base de repli sur un chemin
 *    secondaire (cache de l'app), le fichier principal restant en place ;
 * 3. sinon base en mémoire, [StorageHealth] passe en éphémère.
 * Un échec qui relève du CODE ([OpenFailureKind.DEFECT] : migration absente ou fautive, schéma incohérent) REMONTE : rien
 * n'est déplacé ni vidé, et le crash rend le bug visible au lieu d'effacer en silence le cache de chaque utilisateur.
 * Chaque jalon est consigné dans [DatabaseInitDiagnostics].
 *
 * Une ouverture nominale reprend ce que la base de repli d'un lancement précédent a gardé, puis la supprime : elle n'est
 * pas chiffrée, et elle ne doit jamais être rouverte plus tard sous un autre compte. Une ligne reprise quitte aussitôt
 * la base de repli, et une ligne sauvée n'écrase jamais celle que la base de destination porte déjà : rien n'est rejoué.
 */
public class DatabaseOpener(
    private val context: Context,
    private val diagnostics: DatabaseInitDiagnostics,
    private val health: StorageHealth,
    private val primaryName: String,
    private val clock: () -> Long = System::currentTimeMillis,
    private val secondaryFile: File = File(context.cacheDir, SECONDARY_NAME),
    private val leftovers: DatabaseLeftovers? = null,
    private val readable: (File) -> Boolean = DatabaseRecovery::isReadable,
    private val build: (Context, DatabaseLocation) -> MeeshyDatabase,
) {
    public fun open(): MeeshyDatabase {
        val primaryFile = context.getDatabasePath(primaryName)
        if (DatabaseRecovery.isMarkedCorrupted(primaryFile)) {
            diagnostics.record(DatabaseInitStage.FIRST_FAILURE, "corruption-marked:${primaryFile.name}")
            return recreate(primaryFile)
        }
        if (!readable(primaryFile)) {
            diagnostics.record(DatabaseInitStage.FIRST_FAILURE, "unreadable:${primaryFile.name}")
            return recreate(primaryFile)
        }
        val first = attempt(DatabaseLocation.Named(primaryName))
        first.database?.let {
            health.markNormal()
            adoptFallback(it)
            leftovers?.markInUse(primaryFile)
            return it
        }
        val failure = first.failure ?: IllegalStateException("open failed")
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, failure)
        return when (DatabaseRecovery.classify(failure)) {
            OpenFailureKind.CORRUPTION -> recreate(primaryFile)
            OpenFailureKind.UNAVAILABLE -> fallBack(DatabaseSalvage())
            OpenFailureKind.DEFECT -> throw failure
        }
    }

    private fun recreate(primaryFile: File): MeeshyDatabase {
        val salvaged = quarantine(primaryFile)
        val retry = attempt(DatabaseLocation.Named(primaryName))
        retry.database?.let {
            diagnostics.record(DatabaseInitStage.RECREATED, primaryName)
            restore(it, salvaged)
            health.markDegraded("recreated")
            leftovers?.markInUse(primaryFile)
            return it
        }
        val failure = retry.failure ?: IllegalStateException("recreate failed")
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, failure)
        if (DatabaseRecovery.classify(failure) == OpenFailureKind.DEFECT) throw failure
        return fallBack(salvaged)
    }

    private fun fallBack(salvaged: DatabaseSalvage): MeeshyDatabase {
        secondaryFile.parentFile?.mkdirs()
        val secondary = attempt(DatabaseLocation.Named(secondaryFile.absolutePath))
        secondary.database?.let {
            diagnostics.record(DatabaseInitStage.FELL_BACK_SECONDARY, secondaryFile.absolutePath)
            restore(it, salvaged)
            health.markDegraded("secondary")
            leftovers?.markInUse(secondaryFile)
            return it
        }
        val failure = secondary.failure ?: IllegalStateException("secondary failed")
        diagnostics.record(DatabaseInitStage.FELL_BACK_MEMORY, failure)
        if (DatabaseRecovery.classify(failure) == OpenFailureKind.DEFECT) throw failure
        health.markEphemeral("memory")
        val memory = build(context, DatabaseLocation.Memory)
        restore(memory, salvaged)
        leftovers?.markInUse(null)
        return memory
    }

    /**
     * La base de repli d'un lancement précédent : chaque ligne reprise par la base principale la quitte aussitôt, pour
     * qu'elle ne garde que les pertes (disque plein, contrainte) ; elle disparaît quand il n'en reste aucune. Si une ligne
     * reprise ne peut pas en être retirée, elle disparaît aussi : rejouer un envoi déjà parti (édition, profil, blocage,
     * story) est pire que perdre une ligne que l'utilisateur peut refaire. La purge de session la retire de toute façon.
     */
    private fun adoptFallback(database: MeeshyDatabase) {
        if (!secondaryFile.exists()) return
        val salvage = DatabaseRecovery.salvage(secondaryFile)
        var unforgotten = 0
        val fallback = if (salvage.isEmpty) null else DatabaseRecovery.openWritable(secondaryFile)
        val lost = try {
            restore(database, salvage) { row -> if (fallback == null || !row.forgetIn(fallback)) unforgotten++ }
        } finally {
            runCatching { fallback?.close() }
        }
        if (lost == 0 || unforgotten > 0) DatabaseRecovery.deleteFallback(secondaryFile)
    }

    private fun quarantine(file: File): DatabaseSalvage {
        val salvaged = DatabaseRecovery.salvage(file)
        val moved = DatabaseRecovery.quarantine(file, clock())
        DatabaseRecovery.clearCorruptionMarker(file)
        diagnostics.record(DatabaseInitStage.QUARANTINED, moved.joinToString(",") { it.name })
        DatabaseRecovery.pruneQuarantines(file, keep = MAX_QUARANTINES)
        return salvaged
    }

    /** Une ligne sauvée, sa table et la clé qui l'identifie dans la base d'où elle vient. */
    private class Rescued(val table: String, val values: ContentValues, private val key: List<String>) {
        /** La retire de [source] ; `false` si l'écriture a échoué. */
        fun forgetIn(source: SQLiteDatabase): Boolean = try {
            val where = key.joinToString(" AND ") { "$it = ?" }
            source.delete(table, where, key.map { values.getAsString(it) }.toTypedArray())
            true
        } catch (_: Exception) {
            false
        }
    }

    private class RescueGroup(val stage: DatabaseInitStage, val rows: List<Rescued>)

    /**
     * Réinjecte [salvage] dans [database] ; rend le nombre de lignes qui n'ont pas pu l'être. Chaque ligne s'insère « si
     * absente » : une ligne déjà présente (une annulation demandée, un état plus récent) n'est jamais écrasée par sa copie
     * sauvée, et compte comme reprise. [onRestored] est appelé pour chaque ligne reprise, aussitôt après son insertion.
     */
    private fun restore(
        database: MeeshyDatabase,
        salvage: DatabaseSalvage,
        onRestored: (Rescued) -> Unit = {},
    ): Int {
        if (salvage.isEmpty) return 0
        val groups = listOf(
            RescueGroup(
                DatabaseInitStage.OUTBOX_SALVAGED,
                salvage.outbox.map { Rescued("outbox", it.toValues(), OUTBOX_KEY) },
            ),
            RescueGroup(
                DatabaseInitStage.ERASURES_SALVAGED,
                salvage.plaintextErasures.map { Rescued("e2ee_plaintext_erasures", it.toValues(), ERASURE_KEY) },
            ),
            RescueGroup(
                DatabaseInitStage.PENDING_IDS_SALVAGED,
                salvage.pendingIds.map { Rescued("pending_ids", it.toValues(), PENDING_ID_KEY) },
            ),
        ).filter { it.rows.isNotEmpty() }
        val total = groups.sumOf { it.rows.size }
        val db = try {
            database.openHelper.writableDatabase
        } catch (_: Exception) {
            return total
        }
        // Seule une écriture qui échoue est perdue, et une ligne perdue ne fait pas perdre les autres.
        fun insertIfAbsent(row: Rescued): Boolean = try {
            db.insert(row.table, SQLiteDatabase.CONFLICT_IGNORE, row.values)
            true
        } catch (_: Exception) {
            false
        }
        val restored = groups.sumOf { group ->
            val count = group.rows.count { row -> insertIfAbsent(row).also { if (it) onRestored(row) } }
            diagnostics.record(group.stage, "$count/${group.rows.size}")
            count
        }
        return total - restored
    }

    private class Attempt(val database: MeeshyDatabase?, val failure: Throwable?)

    private fun attempt(location: DatabaseLocation): Attempt {
        var built: MeeshyDatabase? = null
        return try {
            built = build(context, location)
            built.openHelper.writableDatabase
            Attempt(built, null)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Throwable) {
            if (failure is VirtualMachineError) throw failure
            runCatching { built?.close() }
            Attempt(null, failure)
        }
    }

    private fun OutboxEntity.toValues(): ContentValues = ContentValues().apply {
        put("cmid", cmid)
        put("lane", lane)
        put("kind", kind)
        put("targetId", targetId)
        put("payload", payload)
        put("dependsOn", dependsOn)
        put("attempts", attempts)
        put("state", state)
        put("createdAt", createdAt)
        put("updatedAt", updatedAt)
        put("nextAttemptAt", nextAttemptAt)
        put("lastError", lastError)
        put("waitingSince", waitingSince)
        put("cancelRequestedAt", cancelRequestedAt)
        put("ownerId", ownerId)
    }

    private fun PlaintextErasureEntity.toValues(): ContentValues = ContentValues().apply {
        put("account", account)
        put("kind", kind)
        put("itemId", itemId)
        put("clientMessageId", clientMessageId)
        put("senderId", senderId)
        put("recordedAt", recordedAt)
        put("acknowledgedAt", acknowledgedAt)
    }

    private fun PendingIdEntity.toValues(): ContentValues = ContentValues().apply {
        put("localId", localId)
        put("serverId", serverId)
        put("conversationId", conversationId)
        put("reconciledAt", reconciledAt)
    }

    public companion object {
        public const val SECONDARY_NAME: String = "meeshy-fallback.db"

        /** Les quarantaines gardées sur l'appareil : les plus récentes, pour le support ; les autres sont supprimées. */
        public const val MAX_QUARANTINES: Int = 2

        private val OUTBOX_KEY = listOf("cmid")
        private val ERASURE_KEY = listOf("account", "kind", "itemId")
        private val PENDING_ID_KEY = listOf("localId")
    }
}
