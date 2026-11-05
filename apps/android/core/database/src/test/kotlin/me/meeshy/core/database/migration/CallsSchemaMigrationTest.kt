package me.meeshy.core.database.migration

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** 26 vers 27 : le journal d'appels gagne deux colonnes et deux tables locales, sans perdre une ligne. */
@RunWith(RobolectricTestRunner::class)
class CallsSchemaMigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `26 vers 27 conserve les lignes du journal d'appels et leur donne des valeurs vides`() {
        helper.createDatabase(TEST_DB, 26).use { db ->
            db.seedV16()
            db.execSQL("INSERT INTO call_history VALUES ('k1','{\"id\":\"k1\"}',500,600)")
            db.execSQL("INSERT INTO call_history VALUES ('k2','{\"id\":\"k2\"}',700,800)")
        }

        helper.runMigrationsAndValidate(TEST_DB, 27, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.rows("SELECT callId, payload, startedAt, cachedAt, participants, reactionCounts FROM call_history ORDER BY callId"))
                .containsExactly(
                    listOf("k1", "{\"id\":\"k1\"}", "500", "600", "[]", "{}"),
                    listOf("k2", "{\"id\":\"k2\"}", "700", "800", "[]", "{}"),
                ).inOrder()
            assertThat(db.rows("SELECT cmid, state FROM outbox ORDER BY cmid"))
                .containsExactly(listOf("c1", "PENDING"), listOf("c2", "INFLIGHT")).inOrder()
        }
    }

    @Test
    fun `26 vers 27 cree le journal reseau et les transcriptions vides`() {
        helper.createDatabase(TEST_DB, 26).close()

        helper.runMigrationsAndValidate(TEST_DB, 27, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.userTables()).containsAtLeast("call_network_journal", "call_transcript")
            assertThat(db.rows("SELECT COUNT(*) FROM call_network_journal")).containsExactly(listOf("0"))
            assertThat(db.rows("SELECT COUNT(*) FROM call_transcript")).containsExactly(listOf("0"))
            assertThat(db.strayTables()).isEmpty()
        }
    }
}
