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
 * 1. fichier CORROMPU ([OpenFailureKind.CORRUPTION]) : outbox, clairs E2EE à effacer et identifiants en attente sauvés en
 *    lecture seule, fichiers mis en quarantaine (`.corrupted.<ts>`), base recréée, ce qui a été sauvé réinjecté ;
 * 2. disque qui refuse ([OpenFailureKind.UNAVAILABLE]), ou recréation impossible : base de repli sur un chemin
 *    secondaire (cache de l'app), le fichier principal restant en place ;
 * 3. sinon base en mémoire, [StorageHealth] passe en éphémère.
 * Un échec qui relève du CODE ([OpenFailureKind.DEFECT] : migration absente ou fautive, schéma incohérent) REMONTE : rien
 * n'est déplacé ni vidé, et le crash rend le bug visible au lieu d'effacer en silence le cache de chaque utilisateur.
 * Chaque jalon est consigné dans [DatabaseInitDiagnostics].
 *
 * Une ouverture nominale reprend ce que la base de repli d'un lancement précédent a gardé, puis la supprime : elle n'est
 * pas chiffrée, et elle ne doit jamais être rouverte plus tard sous un autre compte.
 */
public class DatabaseOpener(
    private val context: Context,
    private val diagnostics: DatabaseInitDiagnostics,
    private val health: StorageHealth,
    private val primaryName: String,
    private val clock: () -> Long = System::currentTimeMillis,
    private val secondaryFile: File = File(context.cacheDir, SECONDARY_NAME),
    private val leftovers: DatabaseLeftovers? = null,
    private val build: (Context, DatabaseLocation) -> MeeshyDatabase,
) {
    public fun open(): MeeshyDatabase {
        val primaryFile = context.getDatabasePath(primaryName)
        if (!DatabaseRecovery.isReadable(primaryFile)) {
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

    /** La base de repli d'un lancement précédent : ce qu'elle a gardé rejoint la base principale, puis elle disparaît. */
    private fun adoptFallback(database: MeeshyDatabase) {
        if (!secondaryFile.exists()) return
        restore(database, DatabaseRecovery.salvage(secondaryFile))
        DatabaseRecovery.deleteFallback(secondaryFile)
    }

    private fun quarantine(file: File): DatabaseSalvage {
        val salvaged = DatabaseRecovery.salvage(file)
        val moved = DatabaseRecovery.quarantine(file, clock())
        diagnostics.record(DatabaseInitStage.QUARANTINED, moved.joinToString(",") { it.name })
        return salvaged
    }

    private fun restore(database: MeeshyDatabase, salvage: DatabaseSalvage) {
        if (salvage.isEmpty) return
        val db = try {
            database.openHelper.writableDatabase
        } catch (_: Exception) {
            return
        }
        fun insertAll(table: String, rows: List<ContentValues>, conflict: Int): Int = rows.count { values ->
            try {
                db.insert(table, conflict, values) >= 0
            } catch (_: Exception) {
                // Une ligne illisible ne doit pas faire perdre les autres.
                false
            }
        }
        if (salvage.outbox.isNotEmpty()) {
            val restored = insertAll("outbox", salvage.outbox.map { it.toValues() }, SQLiteDatabase.CONFLICT_REPLACE)
            diagnostics.record(DatabaseInitStage.OUTBOX_SALVAGED, "$restored/${salvage.outbox.size}")
        }
        if (salvage.plaintextErasures.isNotEmpty()) {
            val restored = insertAll(
                "e2ee_plaintext_erasures",
                salvage.plaintextErasures.map { it.toValues() },
                SQLiteDatabase.CONFLICT_IGNORE,
            )
            diagnostics.record(DatabaseInitStage.ERASURES_SALVAGED, "$restored/${salvage.plaintextErasures.size}")
        }
        if (salvage.pendingIds.isNotEmpty()) {
            val restored = insertAll("pending_ids", salvage.pendingIds.map { it.toValues() }, SQLiteDatabase.CONFLICT_IGNORE)
            diagnostics.record(DatabaseInitStage.PENDING_IDS_SALVAGED, "$restored/${salvage.pendingIds.size}")
        }
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
    }
}
