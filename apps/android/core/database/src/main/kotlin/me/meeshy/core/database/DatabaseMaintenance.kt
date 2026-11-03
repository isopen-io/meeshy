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
     *
     * En WAL, le framework envoie une instruction en lecture seule sur une connexion SECONDAIRE : `PRAGMA auto_vacuum=2`
     * sur une base déjà peuplée l'est (il ne fait que retenir le mode pour le prochain `VACUUM` de SA connexion), et
     * `VACUUM` partait sur la connexion principale sans lui — le mode ne changeait jamais et le `VACUUM` complet se
     * rejouait à chaque passage. Une transaction épingle la connexion principale : le mode y est lu et retenu, puis le
     * `VACUUM` (jamais en lecture seule, donc sur cette même connexion) l'applique.
     */
    public fun ensureIncrementalAutoVacuum(): Boolean {
        val db = writable() ?: return false
        val mode = onPrimaryConnection(db) { autoVacuumMode(db) } ?: return false
        if (mode == INCREMENTAL) return false
        onPrimaryConnection(db) { db.execSQL("PRAGMA auto_vacuum=$INCREMENTAL") } ?: return false
        return try {
            db.execSQL("VACUUM")
            true
        } catch (_: Exception) {
            false
        }
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

    private fun autoVacuumMode(db: SupportSQLiteDatabase): Int =
        db.query("PRAGMA auto_vacuum").use { if (it.moveToFirst()) it.getInt(0) else 0 }

    private fun <T> onPrimaryConnection(db: SupportSQLiteDatabase, block: () -> T): T? = try {
        db.beginTransactionNonExclusive()
        try {
            block().also { db.setTransactionSuccessful() }
        } finally {
            db.endTransaction()
        }
    } catch (_: Exception) {
        null
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
