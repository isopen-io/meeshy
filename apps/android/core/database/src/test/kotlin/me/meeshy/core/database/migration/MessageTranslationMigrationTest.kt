package me.meeshy.core.database.migration

import androidx.room.testing.MigrationTestHelper
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Les trois tables de traductions arrivent vides à la montée 25 vers 26, sans rien perdre de ce qui existait. */
@RunWith(RobolectricTestRunner::class)
class MessageTranslationMigrationTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `25 vers 26 conserve les donnees existantes et cree les tables vides`() {
        val before = helper.createDatabase(TEST_DB, 25).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows) + db.rows("SELECT id, payload FROM messages")
        }

        helper.runMigrationsAndValidate(TEST_DB, 26, false, *MeeshyMigrations.all).use { db ->
            val after = DURABLE_QUERIES.map(db::rows) + db.rows("SELECT id, payload FROM messages")
            assertThat(after).isEqualTo(before)
            assertThat(db.userTables()).containsAtLeast("message_translations", "message_transcriptions", "message_audio_translations")
            assertThat(db.rows("SELECT * FROM message_translations")).isEmpty()
            assertThat(db.strayTables()).isEmpty()
        }
    }
}
