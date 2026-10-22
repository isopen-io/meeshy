package me.meeshy.core.database.migration

import androidx.room.migration.Migration
import androidx.room.testing.MigrationTestHelper
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private val failingMigration: Migration = object : Migration(17, 18) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("DROP TABLE outbox")
        db.execSQL("CREATE TABLE half_done (x TEXT)")
        error("migration forcee en echec")
    }
}

@RunWith(RobolectricTestRunner::class)
class MigrationFailureKeepsOutboxTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `une migration en echec ne detruit aucune table durable`() {
        val before = helper.createDatabase(TEST_DB, 16).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows)
        }

        helper.runMigrationsAndValidate(TEST_DB, 18, true, Migration_16_17, GuardedMigration(failingMigration)).use { db ->
            assertThat(DURABLE_QUERIES.map(db::rows)).isEqualTo(before)
            assertThat(db.rows("SELECT name FROM sqlite_master WHERE name = 'half_done'")).isEmpty()
        }
    }

    @Test
    fun `une migration en echec ne vide que les tables de cache`() {
        helper.createDatabase(TEST_DB, 16).use { it.seedV16() }

        helper.runMigrationsAndValidate(TEST_DB, 18, true, Migration_16_17, GuardedMigration(failingMigration)).use { db ->
            assertThat(db.rows("SELECT COUNT(*) FROM messages")).containsExactly(listOf("0"))
            assertThat(db.rows("SELECT COUNT(*) FROM conversations")).containsExactly(listOf("0"))
        }
    }
}
