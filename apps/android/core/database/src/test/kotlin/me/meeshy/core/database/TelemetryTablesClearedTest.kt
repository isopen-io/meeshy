package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import me.meeshy.core.database.entity.PendingCountingEventEntity
import me.meeshy.core.database.entity.SocialEventV2OutboxEntity
import me.meeshy.core.database.entity.TrackingLinksCacheEntity

@RunWith(RobolectricTestRunner::class)
class TelemetryTablesClearedTest {

    @Test
    fun `les trois tables de mesures sont enregistrees et clearAllTables les vide`() = runTest {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        db.pendingCountingEventDao().enqueue(PendingCountingEventEntity("e1", "acc", "feed", "view", "{}", 1))
        db.socialEventV2OutboxDao().enqueue(SocialEventV2OutboxEntity("e1", "acc", "{}", 1), now = 1)
        db.trackingLinksCacheDao().upsert(TrackingLinksCacheEntity("acc", "[]", 1))

        db.clearAllTables()

        assertThat(db.pendingCountingEventDao().count("acc", "feed")).isEqualTo(0)
        assertThat(db.socialEventV2OutboxDao().count("acc")).isEqualTo(0)
        assertThat(db.trackingLinksCacheDao().get("acc")).isNull()
        db.close()
    }
}
