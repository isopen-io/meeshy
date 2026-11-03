package me.meeshy.core.database

import android.content.Context
import android.database.sqlite.SQLiteDiskIOException
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class DatabaseMaintenanceTest {

    private fun open(name: String): MeeshyDatabase =
        DatabaseModule.meeshyDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), name)
            .allowMainThreadQueries().build()

    /** Une base dont le fichier est dans le mode [mode] : posé par un pragma puis un VACUUM, et relu après réouverture. */
    private fun startingIn(name: String, mode: Int): MeeshyDatabase {
        open(name).apply {
            val db = openHelper.writableDatabase
            db.beginTransactionNonExclusive()
            try {
                db.execSQL("PRAGMA auto_vacuum=$mode")
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
            db.execSQL("VACUUM")
            close()
        }
        return open(name)
    }

    /** Le mode lu comme le lit n'importe quel appelant : hors transaction, donc sur une connexion de lecture en WAL. */
    private fun liveMode(database: MeeshyDatabase): Int =
        database.openHelper.writableDatabase.query("PRAGMA auto_vacuum").use { it.moveToFirst(); it.getInt(0) }

    @Test
    fun `le checkpoint et le vacuum incremental reussissent sur une base ouverte`() {
        val database = open("maintenance.db")

        val maintenance = DatabaseMaintenance(database)

        assertThat(maintenance.checkpoint()).isTrue()
        assertThat(maintenance.incrementalVacuum()).isTrue()
        database.close()
    }

    @Test
    fun `le mode auto_vacuum incremental est pose une seule fois`() {
        val database = open("autovacuum.db")
        val maintenance = DatabaseMaintenance(database)

        val first = maintenance.ensureIncrementalAutoVacuum()
        val second = maintenance.ensureIncrementalAutoVacuum()

        assertThat(first).isTrue()
        assertThat(second).isFalse()
        database.close()
    }

    @Test
    fun `le mode incremental est lu sur le fichier apres le VACUUM, une fois la base rouverte`() {
        val name = "autovacuum-reopened.db"
        open(name).apply {
            DatabaseMaintenance(this).ensureIncrementalAutoVacuum()
            close()
        }

        val reopened = open(name)
        val mode = reopened.openHelper.writableDatabase.query("PRAGMA auto_vacuum").use { it.moveToFirst(); it.getInt(0) }

        assertThat(mode).isEqualTo(2)
        assertThat(DatabaseMaintenance(reopened).ensureIncrementalAutoVacuum()).isFalse()
        reopened.close()
    }

    @Test
    fun `depuis le mode FULL que pose Android, le mode incremental se lit sur la base encore ouverte`() {
        val database = startingIn("autovacuum-from-full.db", mode = 1)
        assertThat(liveMode(database)).isEqualTo(1)

        val changed = DatabaseMaintenance(database).ensureIncrementalAutoVacuum()

        assertThat(changed).isTrue()
        assertThat(liveMode(database)).isEqualTo(2)
        database.close()
    }

    @Test
    fun `depuis le mode NONE, le mode incremental se lit sur la base encore ouverte`() {
        val database = startingIn("autovacuum-from-none.db", mode = 0)
        assertThat(liveMode(database)).isEqualTo(0)

        val changed = DatabaseMaintenance(database).ensureIncrementalAutoVacuum()

        assertThat(changed).isTrue()
        assertThat(liveMode(database)).isEqualTo(2)
        database.close()
    }

    @Test
    fun `un echec de l'entretien est journalise et compte, jamais avale en silence`() {
        val reported = mutableListOf<Pair<String, Throwable?>>()
        val maintenance = DatabaseMaintenance(
            writableDatabase = { throw SQLiteDiskIOException("disk I/O error") },
            report = { what, failure -> reported += what to failure },
        )

        val changed = maintenance.ensureIncrementalAutoVacuum()

        assertThat(changed).isFalse()
        assertThat(maintenance.failures).isEqualTo(1)
        assertThat(reported.single().second).isInstanceOf(SQLiteDiskIOException::class.java)
    }
}
