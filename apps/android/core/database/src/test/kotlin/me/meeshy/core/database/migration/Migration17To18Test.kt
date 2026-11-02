package me.meeshy.core.database.migration

import android.content.Context
import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class Migration17To18Test {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `17 vers 18 cree cache_entries et keyed_json_cache vides`() {
        helper.createDatabase(TEST_DB, 17).close()

        helper.runMigrationsAndValidate(TEST_DB, 18, true, *MeeshyMigrations.all).use { db ->
            listOf("cache_entries", "keyed_json_cache").forEach {
                assertThat(db.rows("SELECT COUNT(*) FROM $it")).containsExactly(listOf("0"))
            }
        }
    }

    @Test
    fun `17 vers 18 conserve octet pour octet les tables durables`() {
        val before = helper.createDatabase(TEST_DB, 17).use { db ->
            db.seedV16()
            DURABLE_QUERIES.map(db::rows)
        }

        val after = helper.runMigrationsAndValidate(TEST_DB, 18, true, *MeeshyMigrations.all).use { db ->
            DURABLE_QUERIES.map(db::rows)
        }

        assertThat(before.all { it.isNotEmpty() }).isTrue()
        assertThat(after).isEqualTo(before)
    }

    @Test
    fun `une base v16 avec une ligne PENDING arrive en v18 sans repli destructif`() = runTest {
        helper.createDatabase(TEST_DB, 16).use { it.seedV16() }
        val context = ApplicationProvider.getApplicationContext<Context>()

        val db = Room.databaseBuilder(context, MeeshyDatabase::class.java, TEST_DB)
            .addMigrations(*MeeshyMigrations.all)
            .allowMainThreadQueries()
            .build()
        try {
            assertThat(db.outboxDao().byState("PENDING").map { it.cmid }).containsExactly("c1")
            assertThat(db.cacheEntryDao().items("ns", "k")).isEmpty()
            assertThat(db.keyedJsonCacheDao().find("ns", "k")).isNull()
        } finally {
            db.close()
        }
    }
}
