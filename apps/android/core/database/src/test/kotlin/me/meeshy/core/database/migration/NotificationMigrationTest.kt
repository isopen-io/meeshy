package me.meeshy.core.database.migration

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** La liste des notifications arrive vide à la montée de version 23 vers 24, sans rien perdre de ce qui existait. */
@RunWith(RobolectricTestRunner::class)
class NotificationMigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `23 vers 24 garde l outbox et les caches et cree la table des notifications`() {
        val before = helper.createDatabase(TEST_DB, 23).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows) + db.rows("SELECT id, payload FROM messages") + db.rows("SELECT id FROM conversations")
        }

        helper.runMigrationsAndValidate(TEST_DB, 24, false, *MeeshyMigrations.all).use { db ->
            val after = DURABLE_QUERIES.map(db::rows) + db.rows("SELECT id, payload FROM messages") + db.rows("SELECT id FROM conversations")
            assertThat(after).isEqualTo(before)
            assertThat(db.rows("SELECT cmid FROM outbox ORDER BY cmid")).containsExactly(listOf("c1"), listOf("c2")).inOrder()
            assertThat(db.userTables()).contains("notifications")
            assertThat(db.rows("SELECT * FROM notifications")).isEmpty()
            assertThat(db.strayTables()).isEmpty()
        }
    }
}
