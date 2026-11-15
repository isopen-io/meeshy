package me.meeshy.core.database.crypto

import java.io.File

/** Le moteur qui copie une base en clair vers une base chiffrée (SQLCipher en production, un double en test). */
public interface PlaintextExportEngine {
    /** Écrit dans [target] (absent) une copie chiffrée de [plain] avec [passphrase]. */
    public fun export(plain: File, target: File, passphrase: ByteArray)

    /** `true` si [encrypted] s'ouvre avec [passphrase] et porte les mêmes lignes durables que [source] (quand elle existe). */
    public fun verify(source: File?, encrypted: File, passphrase: ByteArray): Boolean
}

public class PlaintextMigrationException(message: String, cause: Throwable? = null) : IllegalStateException(message, cause)

/**
 * Exécute [PlaintextMigrationPlan] sur le disque. L'ancienne base ne disparaît qu'après la vérification de la copie
 * chiffrée ; un échec lève (aucun repli en clair) et la migration reprend au lancement suivant.
 */
public class PlaintextDatabaseMigrator(private val engine: PlaintextExportEngine) {

    public fun facts(main: File): MigrationFacts =
        MigrationFacts(DatabaseFileStates.of(main), temp(main).exists(), backup(main).exists())

    /** Rend les étapes exécutées. */
    public fun migrate(main: File, passphrase: ByteArray): List<MigrationStep> {
        val steps = PlaintextMigrationPlan.steps(facts(main))
        steps.forEach { step -> run(step, main, passphrase) }
        return steps
    }

    /** Remet en place une sauvegarde en clair restée seule (main absente, aucune copie chiffrée à côté). */
    public fun restoreBackup(main: File) {
        if (main.exists() || temp(main).exists() || !backup(main).exists()) return
        run(MigrationStep.RESTORE_BACKUP, main, ByteArray(0))
    }

    private fun run(step: MigrationStep, main: File, passphrase: ByteArray) {
        val temp = temp(main)
        val backup = backup(main)
        try {
            when (step) {
                MigrationStep.DISCARD_TEMP -> deleteWithSides(temp)
                MigrationStep.RESTORE_BACKUP -> moveWithSides(backup, main)
                MigrationStep.EXPORT -> engine.export(main, temp, passphrase.copyOf())
                MigrationStep.VERIFY_TEMP -> verifyTemp(main, temp, backup, passphrase)
                MigrationStep.MOVE_MAIN_TO_BACKUP -> moveWithSides(main, backup)
                MigrationStep.PROMOTE_TEMP -> moveWithSides(temp, main)
                MigrationStep.DELETE_BACKUP -> deleteWithSides(backup)
            }
        } catch (failure: PlaintextMigrationException) {
            throw failure
        } catch (failure: Exception) {
            throw PlaintextMigrationException("migration step $step failed", failure)
        }
    }

    /**
     * Une copie qui ne se vérifie pas est supprimée, que la vérification rende `false` ou qu'elle LÈVE : gardée, elle
     * ferait rejouer la même vérification à chaque lancement sans jamais repartir de la base en clair.
     */
    private fun verifyTemp(main: File, temp: File, backup: File, passphrase: ByteArray) {
        val source = listOf(main, backup).firstOrNull { DatabaseFileStates.of(it) == DatabaseFileState.PLAINTEXT }
        val verified = try {
            engine.verify(source, temp, passphrase.copyOf())
        } catch (failure: Exception) {
            deleteWithSides(temp)
            throw PlaintextMigrationException("encrypted copy could not be verified", failure)
        }
        if (!verified) {
            deleteWithSides(temp)
            throw PlaintextMigrationException("encrypted copy failed verification")
        }
    }

    private fun moveWithSides(from: File, to: File) {
        deleteWithSides(to)
        SIDES.forEach { suffix ->
            val source = File(from.path + suffix)
            if (!source.exists()) return@forEach
            if (!source.renameTo(File(to.path + suffix))) {
                throw PlaintextMigrationException("cannot move ${source.name}")
            }
        }
    }

    private fun deleteWithSides(file: File) {
        SIDES.forEach { suffix ->
            val target = File(file.path + suffix)
            if (target.exists() && !target.delete()) throw PlaintextMigrationException("cannot delete ${target.name}")
        }
    }

    public companion object {
        internal val SIDES: List<String> = listOf("", "-wal", "-shm", "-journal")

        public fun temp(main: File): File = File(main.path + ".enc.tmp")

        public fun backup(main: File): File = File(main.path + ".plain.bak")
    }
}
