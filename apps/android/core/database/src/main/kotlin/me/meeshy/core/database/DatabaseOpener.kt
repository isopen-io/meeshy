package me.meeshy.core.database

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import kotlinx.coroutines.CancellationException
import me.meeshy.core.database.crypto.DatabaseFileState
import me.meeshy.core.database.crypto.DatabaseFileStates
import me.meeshy.core.database.crypto.DatabaseKeyUnavailableException
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
 *    secondaire (cache de l'app), le fichier principal restant en place — sauf si [allowsSecondary] est faux (base
 *    principale chiffrée : une base de repli serait en clair), auquel cas on passe directement au point 3 ;
 * 3. sinon base en mémoire, [StorageHealth] passe en éphémère.
 * Avant tout (marqueur de corruption compris : sans la clé, le sauvetage ne lirait rien et la quarantaine emporterait
 * l'outbox), [prepare] met en place le chiffrement (clé, migration de la base en clair). S'il échoue : une base encore EN
 * CLAIR qu'une corruption empêche d'exporter suit le chemin 1 (sauvetage, quarantaine, recréation chiffrée) ; toute
 * autre panne (disque, coffre qui ne rend pas la clé, bibliothèque native absente) ouvre la base EN MÉMOIRE pour ce
 * lancement, sans toucher au fichier (son outbox y est relue en lecture seule), et le lancement suivant réessaie. Jamais de repli en clair, jamais de plantage en
 * boucle. [salvageOpener] relit la base principale pour le sauvetage : en production, l'ouvreur SQLCipher qui détient la
 * clé.
 * Un échec qui relève du CODE ([OpenFailureKind.DEFECT] : migration absente ou fautive, schéma incohérent) REMONTE : rien
 * n'est déplacé ni vidé, et le crash rend le bug visible au lieu d'effacer en silence le cache de chaque utilisateur.
 * Chaque jalon est consigné dans [DatabaseInitDiagnostics].
 *
 * Une ouverture nominale reprend ce que la base de repli d'un lancement précédent a gardé, puis la supprime : elle n'est
 * pas chiffrée, et elle ne doit jamais être rouverte plus tard sous un autre compte. Une ligne reprise quitte la base de
 * repli dans le même geste, une ligne non reprise y reste, et une ligne sauvée n'écrase jamais celle que la base de
 * destination porte déjà : rien n'est rejoué, rien n'est perdu.
 *
 * Une purge de session restée due sur la base disque (session close pendant un lancement en mémoire, [PendingDiskPurge])
 * passe avant tout : la base sur disque n'est jamais rendue au compte suivant avec les lignes du précédent.
 *
 * Une base en mémoire qui reçoit la copie de l'outbox d'une base sur disque restée intacte tient le registre de ce qu'elle
 * en règle ([DiskOutboxSettlement]) : la prochaine ouverture sur disque en retire ces lignes, et un envoi annulé pendant
 * le lancement en mémoire ne repart pas.
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
    private val prepare: () -> Unit = {},
    private val salvageOpener: SalvageOpener = DatabaseRecovery.frameworkSalvage,
    private val allowsSecondary: Boolean = true,
    private val build: (Context, DatabaseLocation) -> MeeshyDatabase,
) {
    public fun open(): MeeshyDatabase {
        val primaryFile = context.getDatabasePath(primaryName)
        health.markNormal()
        val purge = pendingPurge(primaryFile)
        if (purge.blocked) return inMemory(purge.kept, PURGE_PENDING)
        val database = openPurged(primaryFile)
        restore(database, purge.kept)
        return database
    }

    private class PurgeOutcome(val blocked: Boolean, val kept: DatabaseSalvage = DatabaseSalvage())

    /**
     * La purge de session que la base sur disque doit encore subir ([PendingDiskPurge]), appliquée AVANT toute ouverture :
     * les clairs E2EE à effacer marqués d'un compte sont relus, tous les fichiers de la base supprimés (base de repli
     * comprise), et ces inscriptions repartent dans la base qui s'ouvre. Si le fichier ne se relit pas, la préparation du
     * chiffrement est jouée d'abord (elle rend la clé, ou purge un fichier que la clé perdue ne déverrouille plus), puis la
     * lecture retentée. Un fichier qui ne se relit toujours pas faute de clé ou de disque, ou qui ne se supprime pas,
     * bloque l'ouverture sur disque : le marqueur reste, et rien du compte qui est parti n'est recopié. Un fichier corrompu
     * se supprime sans ses inscriptions, qu'aucune clé ne relirait.
     */
    private fun pendingPurge(primaryFile: File): PurgeOutcome {
        if (!PendingDiskPurge.isDue(primaryFile)) return PurgeOutcome(blocked = false)
        val owed = owedErasures(primaryFile) ?: run {
            prepared()?.let { failure ->
                diagnostics.record(DatabaseInitStage.FIRST_FAILURE, failure)
                return PurgeOutcome(blocked = true)
            }
            owedErasures(primaryFile)
        } ?: return PurgeOutcome(blocked = true)
        val kept = DatabaseSalvage(plaintextErasures = owed)
        if (!PendingDiskPurge.wipe(primaryFile)) {
            diagnostics.record(DatabaseInitStage.FIRST_FAILURE, "$PURGE_PENDING:${primaryFile.name}")
            return PurgeOutcome(blocked = true, kept = kept)
        }
        DatabaseRecovery.deleteFallback(secondaryFile)
        PendingDiskPurge.clear(primaryFile)
        diagnostics.record(DatabaseInitStage.DISK_PURGED, "${primaryFile.name}:erasures=${owed.size}")
        return PurgeOutcome(blocked = false, kept = kept)
    }

    /** Les inscriptions dues de [primaryFile] ; vide pour un fichier corrompu, `null` s'il ne se relit pas (clé, disque). */
    private fun owedErasures(primaryFile: File): List<PlaintextErasureEntity>? = try {
        PendingDiskPurge.owedErasures(primaryFile, salvageOpener)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Throwable) {
        if (failure is VirtualMachineError) throw failure
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, failure)
        if (DatabaseRecovery.classify(failure) == OpenFailureKind.CORRUPTION) emptyList() else null
    }

    private fun openPurged(primaryFile: File): MeeshyDatabase {
        val settlement = DiskOutboxSettlement(primaryFile)
        prepared()?.let { failure -> return afterPrepareFailure(primaryFile, settlement, failure) }
        if (DatabaseRecovery.isMarkedCorrupted(primaryFile)) {
            diagnostics.record(DatabaseInitStage.FIRST_FAILURE, "corruption-marked:${primaryFile.name}")
            return recreate(primaryFile, settlement)
        }
        if (!readable(primaryFile)) {
            diagnostics.record(DatabaseInitStage.FIRST_FAILURE, "unreadable:${primaryFile.name}")
            return recreate(primaryFile, settlement)
        }
        val first = attempt(DatabaseLocation.Named(primaryName))
        first.database?.let {
            settlement.applyTo(it)
            adoptFallback(it)
            leftovers?.markInUse(primaryFile)
            return it
        }
        val failure = first.failure ?: IllegalStateException("open failed")
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, failure)
        return when (DatabaseRecovery.classify(failure)) {
            OpenFailureKind.CORRUPTION -> recreate(primaryFile, settlement)
            OpenFailureKind.UNAVAILABLE -> fallBack(DatabaseSalvage())
            OpenFailureKind.DEFECT -> throw failure
        }
    }

    /** `null` si le chiffrement est en place ; sinon l'échec, qui ne remonte jamais tel quel (voir [afterPrepareFailure]). */
    private fun prepared(): Throwable? = try {
        prepare()
        null
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Throwable) {
        if (failure is VirtualMachineError) throw failure
        failure
    }

    /**
     * Une base encore en clair qu'une corruption empêche d'exporter : sauvée, mise en quarantaine, recréée chiffrée. Toute
     * autre panne de la préparation ouvre la base en mémoire, sans toucher au fichier ni l'ouvrir en clair ; ce que la base
     * en mémoire règle de l'outbox recopiée est inscrit à [settlement], pour que le disque ne le rejoue pas.
     */
    private fun afterPrepareFailure(primaryFile: File, settlement: DiskOutboxSettlement, failure: Throwable): MeeshyDatabase {
        diagnostics.record(DatabaseInitStage.FIRST_FAILURE, failure)
        val corruptPlaintext = DatabaseRecovery.classify(failure) == OpenFailureKind.CORRUPTION &&
            DatabaseFileStates.of(primaryFile) == DatabaseFileState.PLAINTEXT
        if (corruptPlaintext) return recreate(primaryFile, settlement)
        val salvaged = settlement.withoutSettled(salvageInPlace(primaryFile))
        val memory = inMemory(salvaged, encryptionUnavailable(failure))
        settlement.watch(memory, salvaged.outbox.map { it.cmid }.toSet())
        return memory
    }

    /**
     * Ce que la base sur disque garde d'irremplaçable (outbox, ponts d'identifiants, clairs E2EE à effacer), relu en
     * lecture seule pour la base en mémoire : un envoi en attente reste visible, et il repart avec son identifiant
     * d'origine, que le serveur déduplique quand la base sur disque le rejouera. Le fichier n'est ni déplacé ni écrit. Un
     * ouvreur qui lève (bibliothèque native absente, clé indisponible) ne rend rien, sans empêcher la base en mémoire.
     */
    private fun salvageInPlace(primaryFile: File): DatabaseSalvage = try {
        DatabaseRecovery.salvage(primaryFile, salvageOpener)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Throwable) {
        if (failure is VirtualMachineError) throw failure
        DatabaseSalvage()
    }

    /** `encryption-unavailable:key` quand le coffre n'a pas rendu la clé, sinon la nature de l'échec (`unavailable`, `defect`…). */
    private fun encryptionUnavailable(failure: Throwable): String {
        val cause = if (failure is DatabaseKeyUnavailableException) KEY else DatabaseRecovery.classify(failure).name.lowercase()
        return "$ENCRYPTION_UNAVAILABLE$cause"
    }

    private fun recreate(primaryFile: File, settlement: DiskOutboxSettlement): MeeshyDatabase {
        val salvaged = settlement.withoutSettled(quarantine(primaryFile))
        prepared()?.let { failure ->
            diagnostics.record(DatabaseInitStage.FIRST_FAILURE, failure)
            return inMemory(salvaged, encryptionUnavailable(failure))
        }
        val retry = attempt(DatabaseLocation.Named(primaryName))
        retry.database?.let {
            diagnostics.record(DatabaseInitStage.RECREATED, primaryName)
            restore(it, salvaged)
            settlement.applyTo(it)
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
        if (!allowsSecondary) return inMemory(salvaged, MEMORY)
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
        if (DatabaseRecovery.classify(failure) == OpenFailureKind.DEFECT) {
            diagnostics.record(DatabaseInitStage.FELL_BACK_MEMORY, failure)
            throw failure
        }
        return inMemory(salvaged, MEMORY, failure)
    }

    /** La base en mémoire : rien ne sera conservé, [StorageHealth] passe en éphémère et l'interface le dit. */
    private fun inMemory(salvaged: DatabaseSalvage, reason: String, failure: Throwable? = null): MeeshyDatabase {
        when (failure) {
            null -> diagnostics.record(DatabaseInitStage.FELL_BACK_MEMORY, reason)
            else -> diagnostics.record(DatabaseInitStage.FELL_BACK_MEMORY, failure)
        }
        health.markEphemeral(reason)
        val memory = build(context, DatabaseLocation.Memory)
        restore(memory, salvaged)
        leftovers?.markInUse(null)
        return memory
    }

    /**
     * La base de repli d'un lancement précédent rejoint la base principale ligne à ligne, sans jamais en rejouer ni en
     * perdre une : chaque ligne est retirée de la base de repli dans une transaction de celle-ci, insérée dans la base
     * principale, et le retrait n'est validé que si l'insertion a réussi ([adoptRow]). La base de repli ne disparaît que
     * vide de toute ligne lisible ; sinon elle reste pour le lancement suivant et le stockage passe en dégradé, pour que
     * l'interface dise que des envois attendent encore. La purge de session la retire de toute façon.
     */
    private fun adoptFallback(database: MeeshyDatabase) {
        if (!secondaryFile.exists()) return
        val salvage = DatabaseRecovery.salvage(secondaryFile)
        val fallback = if (salvage.isEmpty) null else DatabaseRecovery.openWritable(secondaryFile)
        val kept = try {
            restore(database, salvage) { row, insert -> fallback != null && adoptRow(fallback, row, insert) }
        } finally {
            runCatching { fallback?.close() }
        }
        if (kept == 0) {
            DatabaseRecovery.deleteFallback(secondaryFile)
        } else {
            health.markDegraded("$FALLBACK_KEPT$kept")
        }
    }

    /**
     * Retire [row] de [fallback] et l'insère dans la base principale ([insert]) comme UN geste : le retrait se fait dans
     * une transaction de la base de repli, validée seulement après une insertion réussie. Un retrait refusé n'insère rien,
     * une insertion refusée annule le retrait : la ligne reste dans la base de repli, ni rejouée ni perdue. Seul un échec
     * de la validation elle-même, après une insertion réussie, laisse la ligne des deux côtés ; l'insertion « si absente »
     * du lancement suivant la retrouve alors sans l'écraser.
     */
    private fun adoptRow(fallback: SQLiteDatabase, row: Rescued, insert: () -> Boolean): Boolean = try {
        fallback.beginTransaction()
        try {
            val adopted = row.forgetIn(fallback) && insert()
            if (adopted) fallback.setTransactionSuccessful()
            adopted
        } finally {
            fallback.endTransaction()
        }
    } catch (_: Exception) {
        false
    }

    private fun quarantine(file: File): DatabaseSalvage {
        val salvaged = DatabaseRecovery.salvage(file, salvageOpener)
        val moved = DatabaseRecovery.quarantine(file, clock())
        if (!file.exists()) DatabaseRecovery.clearCorruptionMarker(file)
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
     * sauvée, et compte comme reprise. [adopt] encadre l'insertion de chaque ligne (elle lui est remise) et rend si la
     * ligne est reprise.
     */
    private fun restore(
        database: MeeshyDatabase,
        salvage: DatabaseSalvage,
        adopt: (Rescued, () -> Boolean) -> Boolean = { _, insert -> insert() },
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
            val count = group.rows.count { row -> adopt(row) { insertIfAbsent(row) } }
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

        /** La raison de [StorageState.Degraded] quand la base de repli garde des lignes non reprises, suivie de leur nombre. */
        public const val FALLBACK_KEPT: String = "fallback-kept:"

        /** La raison de [StorageState.Ephemeral] d'une base en mémoire faute de fichier ouvrable. */
        public const val MEMORY: String = "memory"

        /**
         * La raison de [StorageState.Ephemeral] quand la base sur disque attend une purge de session qu'on ne peut pas encore
         * appliquer ([PendingDiskPurge]) : elle n'est pas ouverte, et ce lancement tourne en mémoire.
         */
        public const val PURGE_PENDING: String = "purge-pending"

        /** La raison de [StorageState.Ephemeral] quand le chiffrement n'a pas pu se mettre en place, suivie de la nature de l'échec. */
        public const val ENCRYPTION_UNAVAILABLE: String = "encryption-unavailable:"

        private const val KEY = "key"

        private val OUTBOX_KEY = listOf("cmid")
        private val ERASURE_KEY = listOf("account", "kind", "itemId")
        private val PENDING_ID_KEY = listOf("localId")
    }
}
