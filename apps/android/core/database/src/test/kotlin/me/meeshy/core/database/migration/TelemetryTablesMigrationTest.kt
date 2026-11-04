package me.meeshy.core.database.migration

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** 27 vers 28 : trois tables locales neuves (comptages, événements sociaux v2, liens de suivi), sans toucher l'existant. */
@RunWith(RobolectricTestRunner::class)
class TelemetryTablesMigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `27 vers 28 cree les trois tables vides et garde la file d'envoi`() {
        helper.createDatabase(TEST_DB, 27).use { it.seedV16() }

        helper.runMigrationsAndValidate(TEST_DB, 28, false, *MeeshyMigrations.all).use { db ->
            assertThat(db.userTables())
                .containsAtLeast("pending_counting_events", "social_events_v2_outbox", "tracking_links_cache")
            assertThat(db.rows("SELECT COUNT(*) FROM pending_counting_events")).containsExactly(listOf("0"))
            assertThat(db.rows("SELECT cmid, state FROM outbox ORDER BY cmid"))
                .containsExactly(listOf("c1", "PENDING"), listOf("c2", "INFLIGHT")).inOrder()
            assertThat(db.strayTables()).isEmpty()
        }
    }
}
