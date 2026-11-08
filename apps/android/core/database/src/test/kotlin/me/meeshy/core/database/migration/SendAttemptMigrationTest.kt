package me.meeshy.core.database.migration

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Le journal des tentatives d'envoi arrive vide à la montée 24 vers 25, sans rien perdre de ce qui existait. */
@RunWith(RobolectricTestRunner::class)
class SendAttemptMigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `24 vers 25 conserve les donnees existantes et cree le journal vide`() {
        val before = helper.createDatabase(TEST_DB, 24).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows) + db.rows("SELECT id, payload FROM messages") + db.rows("SELECT id FROM conversations")
        }

        helper.runMigrationsAndValidate(TEST_DB, 25, false, *MeeshyMigrations.all).use { db ->
            val after = DURABLE_QUERIES.map(db::rows) + db.rows("SELECT id, payload FROM messages") + db.rows("SELECT id FROM conversations")
            assertThat(after).isEqualTo(before)
            assertThat(db.userTables()).contains("send_attempts")
            assertThat(db.rows("SELECT * FROM send_attempts")).isEmpty()
            assertThat(db.strayTables()).isEmpty()
        }
    }
}
