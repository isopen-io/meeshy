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

/**
 * The last step fails: the reset rebuilds the caches in the CURRENT shape, so the guarded failure is
 * validated against the current schema (a failure on an older step is followed by the later steps).
 */
private const val FROM: Int = MeeshyMigrations.CURRENT_VERSION - 1
private const val TO: Int = MeeshyMigrations.CURRENT_VERSION

private val failingMigration: Migration = object : Migration(FROM, TO) {
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
        val before = helper.createDatabase(TEST_DB, FROM).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows)
        }

        helper.runMigrationsAndValidate(TEST_DB, TO, false, GuardedMigration(failingMigration)).use { db ->
            assertThat(db.strayTables()).isEmpty()
            assertThat(DURABLE_QUERIES.map(db::rows)).isEqualTo(before)
            assertThat(db.rows("SELECT name FROM sqlite_master WHERE name = 'half_done'")).isEmpty()
        }
    }

    @Test
    fun `une migration en echec ne vide que les tables de cache`() {
        helper.createDatabase(TEST_DB, FROM).use { it.seedV16() }

        helper.runMigrationsAndValidate(TEST_DB, TO, false, GuardedMigration(failingMigration)).use { db ->
            assertThat(db.strayTables()).isEmpty()
            assertThat(db.rows("SELECT COUNT(*) FROM messages")).containsExactly(listOf("0"))
            assertThat(db.rows("SELECT COUNT(*) FROM conversations")).containsExactly(listOf("0"))
        }
    }
}
