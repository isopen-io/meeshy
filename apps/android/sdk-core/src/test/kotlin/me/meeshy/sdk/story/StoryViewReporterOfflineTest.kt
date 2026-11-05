package me.meeshy.sdk.story

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

/** Voir une story hors ligne : le registre durable la grise aussitôt, UNE ligne d'outbox par story part au retour du réseau. */
@RunWith(RobolectricTestRunner::class)
class StoryViewReporterOfflineTest {

    private lateinit var db: MeeshyDatabase
    private val api: StoryApi = mockk(relaxed = true)
    private val ledger = InMemoryStoryViewedLedger()
    private var scheduled = 0

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private val outbox get() = OutboxRepository(db, db.outboxDao())

    private fun reporter() = StoryViewReporter(
        stories = StoryRepository(api, db, db.storyDao(), db.syncMetaDao(), outbox, mockk(relaxed = true)),
        outbox = outbox,
        flush = { scheduled++ },
        ledger = ledger,
        nowMillis = { 42L },
    )


    @Test
    fun `une vue hors ligne est inscrite au registre et enfilee une seule fois par story`() = runTest {
        val id = "5f1d7f3a9b1e8a0012345678"
        coEvery { api.markViewed(id) } throws IOException("hors ligne")

        reporter().report(id)
        reporter().report(id)

        assertThat(ledger.viewed()).containsExactly(id, 42L)
        assertThat(db.outboxDao().pendingTargets(listOf(OutboxKind.MARK_STORY_VIEWED.name))).containsExactly(id)
        assertThat(scheduled).isAtLeast(1)
    }

    @Test
    fun `un identifiant local reste vu en local sans jamais partir`() = runTest {
        reporter().report("pending_abc")

        assertThat(ledger.viewed()).containsExactly("pending_abc", 42L)
        assertThat(db.outboxDao().pendingTargets(listOf(OutboxKind.MARK_STORY_VIEWED.name))).isEmpty()
    }
}
