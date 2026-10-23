package me.meeshy.core.database.migration

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class Migration20To21Test {

    // validateDroppedTables = false: Room's helper would flag the raw-SQL search index as an unexpected
    // table; strayTables() keeps the same check for every table outside that index.

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `20 vers 21 conserve les tables durables et les lignes de cache`() {
        val before = helper.createDatabase(TEST_DB, 20).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows)
        }

        helper.runMigrationsAndValidate(TEST_DB, 21, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.strayTables()).isEmpty()
            assertThat(DURABLE_QUERIES.map(db::rows)).isEqualTo(before)
            assertThat(db.rows("SELECT id FROM messages")).containsExactly(listOf("m1"))
            assertThat(db.rows("SELECT id FROM conversations")).containsExactly(listOf("conv1"))
        }
    }

    @Test
    fun `20 vers 21 cree les index de recherche et leurs declencheurs`() {
        helper.createDatabase(TEST_DB, 20).close()

        helper.runMigrationsAndValidate(TEST_DB, 21, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.strayTables()).isEmpty()
            val names = db.rows("SELECT name FROM sqlite_master WHERE name LIKE '%fts%'").flatten()
            assertThat(names).containsAtLeast(
                "message_fts",
                "conversation_fts",
                "message_fts_after_insert",
                "message_fts_before_delete",
                "conversation_fts_after_delete",
            )
        }
    }

    @Test
    fun `20 vers 21 indexe les messages deja en cache`() {
        helper.createDatabase(TEST_DB, 20).use { db ->
            db.execSQL(
                "INSERT INTO messages (id, conversationId, seq, payload, createdAt, cachedAt, contentText) " +
                    "VALUES ('m9','conv1',1,'{}',1,1,'bonjour le monde')",
            )
        }

        helper.runMigrationsAndValidate(TEST_DB, 21, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.strayTables()).isEmpty()
            assertThat(db.rows("SELECT docid FROM message_fts WHERE message_fts MATCH 'bonjour*'")).hasSize(1)
        }
    }
}
