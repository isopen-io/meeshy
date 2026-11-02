package me.meeshy.core.database.migration

import androidx.test.platform.app.InstrumentationRegistry
import androidx.room.testing.MigrationTestHelper
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class Migration19To20Test {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `19 vers 20 conserve les messages et leur donne les valeurs par defaut`() {
        helper.createDatabase(TEST_DB, 19).use { it.seedV16() }

        helper.runMigrationsAndValidate(TEST_DB, 20, true, *MeeshyMigrations.all).use { db ->
            assertThat(db.rows("SELECT id, payload, sendState FROM messages")).containsExactly(
                listOf("m1", "{\"id\":\"m1\"}", "SENT"),
            )
            assertThat(db.rows("SELECT messageType, isEncrypted, retryCount, changeVersion, columnsBackfilled, serverId FROM messages"))
                .containsExactly(listOf("text", "0", "0", "0", "0", null))
        }
    }

    @Test
    fun `19 vers 20 cree pending_ids vide et les index des messages`() {
        helper.createDatabase(TEST_DB, 19).close()

        helper.runMigrationsAndValidate(TEST_DB, 20, true, *MeeshyMigrations.all).use { db ->
            assertThat(db.rows("SELECT COUNT(*) FROM pending_ids")).containsExactly(listOf("0"))
            val indexes = db.rows("SELECT name FROM pragma_index_list('messages')").flatten()
            assertThat(indexes).containsAtLeast("index_messages_serverId", "index_messages_expiresAt", "index_messages_pinnedAt")
        }
    }

    @Test
    fun `19 vers 20 conserve octet pour octet les tables durables`() {
        val before = helper.createDatabase(TEST_DB, 19).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows)
        }

        val after = helper.runMigrationsAndValidate(TEST_DB, 20, true, *MeeshyMigrations.all).use { db ->
            DURABLE_QUERIES.map(db::rows)
        }

        assertThat(before.all { it.isNotEmpty() }).isTrue()
        assertThat(after).isEqualTo(before)
    }
}
