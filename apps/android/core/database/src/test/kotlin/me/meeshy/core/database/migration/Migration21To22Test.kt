package me.meeshy.core.database.migration

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
 * #13821 — la fenêtre récente d'un fil (`MessageDao.endToEndCandidates`, l'aperçu, la fenêtre bornée) se lit par
 * l'index `(conversationId, createdAt)` : plus de tri temporaire sur tout le fil d'une conversation.
 */
@RunWith(RobolectricTestRunner::class)
class Migration21To22Test {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `21 vers 22 conserve les tables durables et chaque colonne des messages en cache`() {
        val before = helper.createDatabase(TEST_DB, 21).use { db ->
            db.seedV16()
            db.execSQL(
                "INSERT INTO messages (id, conversationId, seq, payload, createdAt, cachedAt, serverId, messageType, " +
                    "isEncrypted, encryptionMode, contentText, viewOnceOpenedAt, changeVersion, columnsBackfilled) " +
                    "VALUES ('m2','conv1',2,'{\"id\":\"m2\"}',30,31,'m2','system',1,'e2ee',NULL,32,4,1)",
            )
            (DURABLE_QUERIES + MESSAGES_QUERY).map(db::rows)
        }

        helper.runMigrationsAndValidate(TEST_DB, 22, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.strayTables()).isEmpty()
            assertThat(before.last()).hasSize(2)
            assertThat((DURABLE_QUERIES + MESSAGES_QUERY).map(db::rows)).isEqualTo(before)
        }
    }

    @Test
    fun `21 vers 22 lit la fenetre recente d un fil par l index conversation et date, sans tri temporaire`() {
        helper.createDatabase(TEST_DB, 21).close()

        helper.runMigrationsAndValidate(TEST_DB, 22, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.rows("SELECT name FROM sqlite_master WHERE type = 'index' AND name = '$TIMELINE_INDEX'"))
                .containsExactly(listOf(TIMELINE_INDEX))
            val plan = db.recentWindowPlan()
            assertThat(plan).contains(TIMELINE_INDEX)
            assertThat(plan).doesNotContain("TEMP B-TREE")
        }
    }

    private fun SupportSQLiteDatabase.recentWindowPlan(): String =
        rows(
            "EXPLAIN QUERY PLAN SELECT id FROM messages WHERE conversationId = 'conv1' ORDER BY createdAt DESC LIMIT 200",
        ).joinToString(" | ") { it.joinToString(" ") }

    private companion object {
        const val TIMELINE_INDEX = "index_messages_conversationId_createdAt"
        const val MESSAGES_QUERY = "SELECT * FROM messages ORDER BY id"
    }
}
