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
class OutboxSurvivesUpgradeTest {

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), MeeshyDatabase::class.java)

    @Test
    fun `une ligne PENDING et une ligne INFLIGHT sont relues par le DAO apres la mise a jour`() = runTest {
        helper.createDatabase(TEST_DB, 16).use { it.seedV16() }
        val context = ApplicationProvider.getApplicationContext<Context>()

        val db = Room.databaseBuilder(context, MeeshyDatabase::class.java, TEST_DB)
            .addMigrations(*MeeshyMigrations.all)
            .allowMainThreadQueries()
            .build()
        try {
            assertThat(db.outboxDao().byState("PENDING").map { it.cmid }).containsExactly("c1")
            assertThat(db.outboxDao().byState("INFLIGHT").map { it.cmid }).containsExactly("c2")
            assertThat(db.messageDao().find("m1")?.sendState).isEqualTo("SENT")
            assertThat(db.outboxDao().resetInflight(now = 99L)).isEqualTo(1)
            assertThat(db.outboxDao().deliverableForLane("message:conv1").map { it.cmid }).contains("c1")
        } finally {
            db.close()
        }
    }
}
