package me.meeshy.core.database

import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * L'entretien de la base (iOS `DatabaseMaintenance`) : vidage du journal WAL et récupération des pages libres.
 * Chaque geste est court et ne tient aucune transaction ouverte ; un échec est avalé (la base reste utilisable).
 */
public class DatabaseMaintenance(private val database: MeeshyDatabase) {

    public fun checkpoint(): Boolean = run("PRAGMA wal_checkpoint(TRUNCATE)")

    public fun incrementalVacuum(): Boolean = run("PRAGMA incremental_vacuum")

    /**
     * Base existante créée sans `auto_vacuum` : bascule en mode incrémental puis `VACUUM` UNE fois (il reconstruit le
     * fichier, d'où son statut de tâche d'entretien). Sans effet quand le mode est déjà posé.
     */
    public fun ensureIncrementalAutoVacuum(): Boolean {
        val db = writable() ?: return false
        if (autoVacuumMode(db) == INCREMENTAL) return false
        return run("PRAGMA auto_vacuum=$INCREMENTAL") && run("VACUUM")
    }

    /** Tout l'entretien, dans l'ordre : mode, pages libres, journal. */
    public fun runAll(): Boolean {
        ensureIncrementalAutoVacuum()
        val vacuumed = incrementalVacuum()
        val checkpointed = checkpoint()
        return vacuumed && checkpointed
    }

    private fun writable(): SupportSQLiteDatabase? = try {
        database.openHelper.writableDatabase
    } catch (_: Exception) {
        null
    }

    /**
     * En WAL, une lecture hors transaction part sur une connexion secondaire, qui garde le mode d'avant le `VACUUM` tant
     * qu'elle n'a pas relu l'en-tête : l'entretien reconstruirait le fichier à chaque passage. Une transaction prend la
     * connexion principale, celle du `VACUUM`, et relit l'en-tête.
     */
    private fun <T> onPrimary(db: SupportSQLiteDatabase, block: () -> T): T {
        db.beginTransaction()
        try {
            return block().also { db.setTransactionSuccessful() }
        } finally {
            db.endTransaction()
        }
    }

    private fun autoVacuumMode(db: SupportSQLiteDatabase): Int = try {
        onPrimary(db) { db.query("PRAGMA auto_vacuum").use { if (it.moveToFirst()) it.getInt(0) else 0 } }
    } catch (_: Exception) {
        0
    }

    private fun run(sql: String): Boolean {
        val db = writable() ?: return false
        return try {
            db.query(sql).use { it.moveToFirst() }
            true
        } catch (_: Exception) {
            false
        }
    }

    private companion object {
        const val INCREMENTAL = 2
    }
}
