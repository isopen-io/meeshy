package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationReorderItem
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #18915 (AND-04) — the order a drag set on another device (`user:preferences-reordered`) lands on the cached rows the
 * list sorts its category sections by, without touching the version the preference broadcasts arbitrate with.
 */
@RunWith(RobolectricTestRunner::class)
class ConversationRemoteReorderTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = ConversationRepository(
        mockk<ConversationApi>(), db, db.conversationDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()),
    )

    private suspend fun ConversationRepository.prefs(id: String) = conversationStream(id).first()?.resolvedPreferences

    @Test
    fun `a reorder made on another device lands on the cached rows and keeps their version`() = runTest {
        val repo = repository()
        repo.remember(
            ApiConversation(id = "c-a", preferences = ApiConversationPreferences(categoryId = "work", orderInCategory = 0, version = 4)),
        )
        repo.remember(
            ApiConversation(id = "c-b", preferences = ApiConversationPreferences(categoryId = "work", orderInCategory = 1, version = 2)),
        )

        val written = repo.applyRemoteReorder(listOf(ConversationReorderItem("c-a", 1), ConversationReorderItem("c-b", 0)))

        assertThat(written).isEqualTo(2)
        assertThat(repo.prefs("c-a")).isEqualTo(ApiConversationPreferences(categoryId = "work", orderInCategory = 1, version = 4))
        assertThat(repo.prefs("c-b")).isEqualTo(ApiConversationPreferences(categoryId = "work", orderInCategory = 0, version = 2))
    }

    @Test
    fun `a reorder naming a conversation not cached, or a place already held, writes nothing`() = runTest {
        val repo = repository()
        repo.remember(ApiConversation(id = "c-a", preferences = ApiConversationPreferences(orderInCategory = 3)))

        val written = repo.applyRemoteReorder(listOf(ConversationReorderItem("c-a", 3), ConversationReorderItem("missing", 0)))

        assertThat(written).isEqualTo(0)
        assertThat(repo.prefs("c-a")?.orderInCategory).isEqualTo(3)
    }
}
