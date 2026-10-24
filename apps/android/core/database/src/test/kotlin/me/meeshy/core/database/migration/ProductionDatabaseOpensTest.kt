package me.meeshy.core.database.migration

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.DatabaseModule
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun openAsTheAppDoes(name: String): MeeshyDatabase =
    DatabaseModule.meeshyDatabaseBuilder(ApplicationProvider.getApplicationContext(), name)
        .allowMainThreadQueries()
        .build()

private fun preBaselineInstall(name: String, version: Int) {
    val file = ApplicationProvider.getApplicationContext<Context>().getDatabasePath(name)
    file.parentFile?.mkdirs()
    SQLiteDatabase.openOrCreateDatabase(file, null).use { db ->
        db.execSQL("CREATE TABLE messages (id TEXT PRIMARY KEY, legacyShape TEXT)")
        db.execSQL("INSERT INTO messages VALUES ('old', 'v15')")
        db.version = version
    }
}

@RunWith(RobolectricTestRunner::class)
class ProductionDatabaseOpensTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `une installation neuve ouvre la base avec la configuration de production`() {
        val database = openAsTheAppDoes("fresh-install.db")

        val db = database.openHelper.writableDatabase

        assertThat(db.version).isEqualTo(MeeshyMigrations.CURRENT_VERSION)
        database.close()
    }

    @Test
    fun `une base v16 s'ouvre avec la configuration de production et garde ses lignes durables`() {
        val before = helper.createDatabase(TEST_DB, MeeshyMigrations.BASELINE_VERSION).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows)
        }

        val database = openAsTheAppDoes(TEST_DB)
        val db = database.openHelper.writableDatabase

        assertThat(db.version).isEqualTo(MeeshyMigrations.CURRENT_VERSION)
        assertThat(V16_DURABLE_QUERIES.map(db::rows)).isEqualTo(before)
        assertThat(db.rows("SELECT nextAttemptAt, lastError, waitingSince, cancelRequestedAt, ownerId FROM outbox").flatten())
            .containsExactlyElementsIn(List(10) { null })
        database.close()
    }

    @Test
    fun `une base anterieure a la baseline est remise a zero puis s'ouvre`() {
        preBaselineInstall("pre-baseline.db", MeeshyMigrations.BASELINE_VERSION - 1)

        val database = openAsTheAppDoes("pre-baseline.db")
        val db = database.openHelper.writableDatabase

        assertThat(db.version).isEqualTo(MeeshyMigrations.CURRENT_VERSION)
        assertThat(db.rows("SELECT COUNT(*) FROM messages")).containsExactly(listOf("0"))
        assertThat(db.rows("SELECT COUNT(*) FROM outbox")).containsExactly(listOf("0"))
        database.close()
    }
}
