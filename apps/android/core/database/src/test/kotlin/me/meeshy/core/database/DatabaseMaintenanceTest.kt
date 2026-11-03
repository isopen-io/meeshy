package me.meeshy.core.database

import android.content.Context
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
}
