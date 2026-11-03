package me.meeshy.core.database

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import kotlinx.coroutines.CancellationException
import me.meeshy.core.database.entity.OutboxEntity

/** Où vit la base : un nom (relatif au dossier des bases, ou chemin absolu) ou la mémoire. */
public sealed interface DatabaseLocation {
    public data class Named(val name: String) : DatabaseLocation
    public data object Memory : DatabaseLocation
}

/**
 * Ouvre la base sans JAMAIS lever pour cause de fichier abîmé ou de disque plein (iOS `ResilientDatabaseQueue`) :
 * 1. fichier illisible ou ouverture en échec : outbox sauvée en lecture seule, fichiers mis en quarantaine
 *    (`.corrupted.<ts>`), base recréée, envois en attente réinjectés ;
 * 2. sinon base de repli sur un chemin secondaire (cache de l'app) ;
 * 3. sinon base en mémoire, [StorageHealth] passe en éphémère.
 * Chaque jalon est consigné dans [DatabaseInitDiagnostics].
 */
public class DatabaseOpener(
    private val context: Context,
    private val diagnostics: DatabaseInitDiagnostics,
    private val health: StorageHealth,
    private val primaryName: String,
    private val clock: () -> Long = System::currentTimeMillis,
    private val secondaryFile: File = File(context.cacheDir, SECONDARY_NAME),
    private val build: (Context, DatabaseLocation) -> MeeshyDatabase,
) {
    public fun open(): MeeshyDatabase {
        val primaryFile = context.getDatabasePath(primaryName)
        var salvaged = emptyList<OutboxEntity>()
        if (!DatabaseRecovery.isReadable(primaryFile)) {
            diagnostics.record(DatabaseInitStage.FIRST_FAILURE, "unreadable:${primaryFile.name}")
            salvaged = quarantine(primaryFile)
            return openAfterFailure(salvaged, recreated = true)
        }
        val first = attempt(DatabaseLocation.Named(primaryName))
        if (first.database != null) {
            health.markNormal()
            return first.database
        }
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, first.failure ?: IllegalStateException("open failed"))
        salvaged = quarantine(primaryFile)
        return openAfterFailure(salvaged, recreated = true)
    }

    private fun openAfterFailure(salvaged: List<OutboxEntity>, recreated: Boolean): MeeshyDatabase {
        val retry = attempt(DatabaseLocation.Named(primaryName))
        retry.database?.let {
            diagnostics.record(DatabaseInitStage.RECREATED, primaryName)
            restore(it, salvaged)
            if (recreated) health.markDegraded("recreated")
            return it
        }
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, retry.failure ?: IllegalStateException("recreate failed"))
        secondaryFile.parentFile?.mkdirs()
        val secondary = attempt(DatabaseLocation.Named(secondaryFile.absolutePath))
        secondary.database?.let {
            diagnostics.record(DatabaseInitStage.FELL_BACK_SECONDARY, secondaryFile.absolutePath)
            restore(it, salvaged)
            health.markDegraded("secondary")
            return it
        }
        diagnostics.record(DatabaseInitStage.FELL_BACK_MEMORY, secondary.failure ?: IllegalStateException("secondary failed"))
        health.markEphemeral("memory")
        val memory = build(context, DatabaseLocation.Memory)
        restore(memory, salvaged)
        return memory
    }

    private fun quarantine(file: File): List<OutboxEntity> {
        val salvaged = DatabaseRecovery.salvageOutbox(file)
        val moved = DatabaseRecovery.quarantine(file, clock())
        diagnostics.record(DatabaseInitStage.QUARANTINED, moved.joinToString(",") { it.name })
        return salvaged
    }

    private fun restore(database: MeeshyDatabase, rows: List<OutboxEntity>) {
        if (rows.isEmpty()) return
        val db = try {
            database.openHelper.writableDatabase
        } catch (_: Exception) {
            return
        }
        var restored = 0
        rows.forEach { row ->
            try {
                if (db.insert("outbox", SQLiteDatabase.CONFLICT_REPLACE, row.toValues()) >= 0) restored++
            } catch (_: Exception) {
                // Une ligne de file illisible ne doit pas faire perdre les autres.
            }
        }
        diagnostics.record(DatabaseInitStage.OUTBOX_SALVAGED, "$restored/${rows.size}")
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

    public companion object {
        public const val SECONDARY_NAME: String = "meeshy-fallback.db"
    }
}
