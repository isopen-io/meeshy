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
class MeeshyMigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `16 vers 17 conserve octet pour octet les tables durables`() {
        val before = helper.createDatabase(TEST_DB, 16).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows)
        }

        val after = helper.runMigrationsAndValidate(TEST_DB, 17, true, *MeeshyMigrations.all).use { db ->
            DURABLE_QUERIES.map(db::rows)
        }

        assertThat(before.all { it.isNotEmpty() }).isTrue()
        assertThat(after).isEqualTo(before)
    }

    @Test
    fun `16 vers 17 conserve les messages et les conversations en cache`() {
        helper.createDatabase(TEST_DB, 16).use { it.seedV16() }

        helper.runMigrationsAndValidate(TEST_DB, 17, true, *MeeshyMigrations.all).use { db ->
            assertThat(db.rows("SELECT id, conversationId, sendState FROM messages"))
                .containsExactly(listOf("m1", "conv1", "SENT"))
            assertThat(db.rows("SELECT id, unreadCount FROM conversations"))
                .containsExactly(listOf("conv1", "3"))
        }
    }

    @Test
    fun `16 vers 17 cree les quatre nouvelles tables vides`() {
        helper.createDatabase(TEST_DB, 16).close()

        helper.runMigrationsAndValidate(TEST_DB, 17, true, *MeeshyMigrations.all).use { db ->
            listOf("ephemeral_receipts", "message_edit_revisions", "directory_contacts", "media_index").forEach {
                assertThat(db.rows("SELECT COUNT(*) FROM $it")).containsExactly(listOf("0"))
            }
        }
    }

    @Test
    fun `la version courante declaree correspond au schema exporte`() {
        helper.createDatabase(TEST_DB, MeeshyMigrations.CURRENT_VERSION).use { db ->
            assertThat(db.version).isEqualTo(MeeshyMigrations.CURRENT_VERSION)
        }
    }
}
