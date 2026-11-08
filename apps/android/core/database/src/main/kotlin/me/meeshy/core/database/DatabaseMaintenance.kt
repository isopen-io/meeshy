package me.meeshy.core.database

import android.util.Log
import androidx.sqlite.db.SupportSQLiteDatabase
import java.util.concurrent.atomic.AtomicInteger

/**
 * L'entretien de la base (iOS `DatabaseMaintenance`) : vidage du journal WAL et récupération des pages libres.
 * Chaque geste est court et ne tient aucune transaction ouverte. Un échec laisse la base utilisable, mais il n'est jamais
 * avalé en silence : il est journalisé ([report]) et compté ([failures]).
 */
public class DatabaseMaintenance(
    private val writableDatabase: () -> SupportSQLiteDatabase,
    private val report: (String, Throwable?) -> Unit = ::logFailure,
) {
    public constructor(database: MeeshyDatabase) : this({ database.openHelper.writableDatabase })

    private val failed = AtomicInteger()

    /** Le nombre de gestes d'entretien qui ont échoué depuis la création de cet objet. */
    public val failures: Int get() = failed.get()

    public fun checkpoint(): Boolean = run("PRAGMA wal_checkpoint(TRUNCATE)")

    public fun incrementalVacuum(): Boolean = run("PRAGMA incremental_vacuum")

    /**
     * Pose `auto_vacuum=INCREMENTAL` UNE fois, quel que soit le mode de départ : NONE, ou FULL, celui que le SQLite
     * d'Android donne à toute base qu'il crée (`SQLITE_DEFAULT_AUTOVACUUM=1`). Sans effet quand le mode est déjà posé.
     *
     * 1. Le mode est lu, puis le pragma posé, sur la connexion PRINCIPALE : une transaction l'y épingle. En WAL, le
     *    framework enverrait sinon ces instructions en lecture seule sur une connexion secondaire, qui ne retient le mode
     *    que pour elle-même.
     * 2. Le `VACUUM` s'exécute sur cette même connexion, HORS transaction (SQLite le refuse dans une transaction). Il
     *    reconstruit le fichier dans le mode retenu par le pragma, d'où son statut de tâche d'entretien.
     * 3. Le mode est relu sur la connexion principale : `true` seulement s'il vaut INCREMENTAL.
     * 4. Les connexions de lecture gardent en mémoire le mode lu à leur dernière ouverture de transaction, et
     *    `PRAGMA auto_vacuum` n'en ouvre pas : elles sont fermées (un aller-retour hors du WAL), et les suivantes lisent
     *    le fichier tel qu'il est.
     */
    public fun ensureIncrementalAutoVacuum(): Boolean {
        val db = writable() ?: return false
        val mode = step("auto_vacuum : lecture du mode") { onPrimaryConnection(db) { autoVacuumMode(db) } } ?: return false
        if (mode == INCREMENTAL) return false
        step("auto_vacuum : PRAGMA auto_vacuum=$INCREMENTAL") {
            onPrimaryConnection(db) { db.execSQL("PRAGMA auto_vacuum=$INCREMENTAL") }
        } ?: return false
        step("auto_vacuum : VACUUM") { db.execSQL("VACUUM") } ?: return false
        val applied = step("auto_vacuum : relecture du mode") { onPrimaryConnection(db) { autoVacuumMode(db) } } ?: return false
        if (applied != INCREMENTAL) {
            fail("auto_vacuum : le mode vaut $applied apres le VACUUM, depuis $mode (attendu $INCREMENTAL)", null)
            return false
        }
        refreshReaders(db)
        return true
    }

    /** Tout l'entretien, dans l'ordre : mode, pages libres, journal. */
    public fun runAll(): Boolean {
        ensureIncrementalAutoVacuum()
        val vacuumed = incrementalVacuum()
        val checkpointed = checkpoint()
        return vacuumed && checkpointed
    }

    private fun writable(): SupportSQLiteDatabase? = step("ouverture de la base", writableDatabase)

    private fun autoVacuumMode(db: SupportSQLiteDatabase): Int =
        db.query("PRAGMA auto_vacuum").use { if (it.moveToFirst()) it.getInt(0) else 0 }

    private fun <T> onPrimaryConnection(db: SupportSQLiteDatabase, block: () -> T): T {
        db.beginTransactionNonExclusive()
        try {
            return block().also { db.setTransactionSuccessful() }
        } finally {
            db.endTransaction()
        }
    }

    /**
     * Ferme les connexions de lecture ouvertes : désactiver le WAL les retire du pool, le réactiver rend le pool d'avant.
     * Refusé quand une autre connexion est en cours d'usage (rien n'a changé alors) ; l'échec est compté, la base reste
     * dans le bon mode, seule une lecture du pragma sur une ancienne connexion reste en retard.
     */
    private fun refreshReaders(db: SupportSQLiteDatabase) {
        if (!db.isWriteAheadLoggingEnabled) return
        step("auto_vacuum : fermeture des connexions de lecture") { db.disableWriteAheadLogging() } ?: return
        val restored = step("auto_vacuum : retour au journal WAL") { db.enableWriteAheadLogging() }
        if (restored == false) fail("auto_vacuum : le journal WAL n'a pas pu etre retabli", null)
    }

    private fun run(sql: String): Boolean {
        val db = writable() ?: return false
        return step(sql) { db.query(sql).use { it.moveToFirst() } } != null
    }

    private fun <T> step(what: String, block: () -> T): T? = try {
        block()
    } catch (failure: Exception) {
        fail(what, failure)
        null
    }

    private fun fail(what: String, failure: Throwable?) {
        failed.incrementAndGet()
        report(what, failure)
    }

    private companion object {
        const val INCREMENTAL = 2
    }
}

private fun logFailure(what: String, failure: Throwable?) {
    Log.w("DatabaseMaintenance", "Echec de l'entretien de la base : $what", failure)
}
