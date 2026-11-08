package me.meeshy.core.database.migration

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #14655 — la file des clairs E2EE à retirer arrive vide, sans rien toucher d'autre, et une réinitialisation des caches la garde. */
@RunWith(RobolectricTestRunner::class)
class Migration22To23Test {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `22 vers 23 conserve les tables durables et cree la file des effacements vide`() {
        val before = helper.createDatabase(TEST_DB, 22).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows)
        }

        helper.runMigrationsAndValidate(TEST_DB, 23, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.strayTables()).isEmpty()
            assertThat(DURABLE_QUERIES.map(db::rows)).isEqualTo(before)
            assertThat(db.rows("SELECT * FROM e2ee_plaintext_erasures")).isEmpty()
        }
    }

    @Test
    fun `une reinitialisation des caches garde les effacements en attente`() {
        helper.createDatabase(TEST_DB, 23).use { db ->
            db.execSQL(
                "INSERT INTO e2ee_plaintext_erasures (account, kind, itemId, clientMessageId, senderId, recordedAt) " +
                    "VALUES ('', 'message', 'm1', 'cid_1', 'me', 10)",
            )
            CacheReset.run(db)
            assertThat(db.rows("SELECT itemId, clientMessageId FROM e2ee_plaintext_erasures")).containsExactly(listOf("m1", "cid_1"))
        }
    }
}
