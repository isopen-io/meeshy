package me.meeshy.core.database.migration

import android.content.Context
import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class Migration18To19Test {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    private val newColumns = listOf("nextAttemptAt", "lastError", "waitingSince", "cancelRequestedAt", "ownerId")

    @Test
    fun `18 vers 19 ajoute cinq colonnes nullables a outbox`() {
        helper.createDatabase(TEST_DB, 18).close()

        helper.runMigrationsAndValidate(TEST_DB, 19, true, *MeeshyMigrations.all).use { db ->
            val columns = db.rows("SELECT name, \"notnull\" FROM pragma_table_info('outbox')").associate { it[0] to it[1] }
            newColumns.forEach { assertThat(columns[it]).isEqualTo("0") }
        }
    }

    @Test
    fun `18 vers 19 ne perd aucune ligne et laisse les nouvelles colonnes a NULL`() {
        val before = helper.createDatabase(TEST_DB, 18).use { db ->
            db.seedV16()
            db.rows("SELECT * FROM outbox ORDER BY cmid")
        }

        helper.runMigrationsAndValidate(TEST_DB, 19, true, *MeeshyMigrations.all).use { db ->
            val after = db.rows("SELECT * FROM outbox ORDER BY cmid")
            assertThat(after.map { it.take(10) }).isEqualTo(before)
            assertThat(after.flatMap { it.drop(10) }.all { it == null }).isTrue()
            assertThat(db.rows("SELECT * FROM media_blob")).hasSize(1)
        }
    }

    @Test
    fun `une base v16 arrive en v19 sans repli destructif et le DAO relit les lignes`() = runTest {
        helper.createDatabase(TEST_DB, 16).use { it.seedV16() }
        val context = ApplicationProvider.getApplicationContext<Context>()

        val db = Room.databaseBuilder(context, MeeshyDatabase::class.java, TEST_DB)
            .addMigrations(*MeeshyMigrations.all)
            .allowMainThreadQueries()
            .build()
        try {
            val rows = db.outboxDao().byState("PENDING") + db.outboxDao().byState("INFLIGHT")
            assertThat(rows.map { it.cmid }).containsExactly("c1", "c2")
            assertThat(rows.all { it.ownerId == null && it.nextAttemptAt == null }).isTrue()
        } finally {
            db.close()
        }
    }
}
