package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.MessageApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageRecentNetworkTest {

    private lateinit var db: MeeshyDatabase
    private var now = 10_000_000L
    private val clock = object : CacheClock { override fun nowMillis(): Long = now }

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun message(id: String, at: String) = ApiMessage(id = id, conversationId = "c1", content = id, createdAt = at)

    private fun reader(api: MessageApi) =
        MessageHistoryReader(api, db, db.messageDao(), db.syncMetaDao(), clock)

    @Test
    fun `le reseau est borne a cinq messages, du plus ancien au plus recent, sans rien ecrire en cache`(): Unit = runBlocking {
        val api = mockk<MessageApi>()
        coEvery { api.list("c1", any(), any(), any()) } returns ApiResponse(
            success = true,
            data = (7 downTo 1).map { message("m$it", "2026-06-01T10:0$it:00Z") },
        )

        val recent = reader(api).recentMessagesFromNetwork("c1")

        coVerify(exactly = 1) { api.list("c1", 0, 5, null) }
        assertThat(recent!!.map { it.id }).containsExactly("m3", "m4", "m5", "m6", "m7").inOrder()
        assertThat(db.messageDao().listForConversation("c1")).isEmpty()
    }

    @Test
    fun `un echec reseau rend null et jamais une liste vide`(): Unit = runBlocking {
        val api = mockk<MessageApi>()
        coEvery { api.list(any(), any(), any(), any()) } returns ApiResponse(success = false, error = "down")

        assertThat(reader(api).recentMessagesFromNetwork("c1")).isNull()
    }

    @Test
    fun `le cache est frais deux minutes apres la synchro puis perime`(): Unit = runBlocking {
        val history = reader(mockk())
        db.syncMetaDao().upsert(SyncMetaEntity("messages:c1", now - 60_000, null, null, null))
        assertThat(history.isCacheFresh("c1")).isTrue()

        now += 120_000
        assertThat(history.isCacheFresh("c1")).isFalse()
        assertThat(history.isCacheFresh("never-synced")).isFalse()
    }
}
