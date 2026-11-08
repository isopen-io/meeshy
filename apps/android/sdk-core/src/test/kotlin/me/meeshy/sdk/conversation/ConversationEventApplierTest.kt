package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ConversationMergeRules
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.preview.PreviewFieldUpdate
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConversationEventApplierTest {

    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun applier(api: ConversationApi = mockk()): ConversationEventApplier {
        val session = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        }
        val patcher = ConversationLivePatcher(
            database = db,
            conversationDao = db.conversationDao(),
            messageDao = db.messageDao(),
            conversationApi = api,
            session = session,
            readerLabel = object : ReaderLabelProvider {
                override fun youLabel(): String = "Vous"
            },
        )
        return ConversationEventApplier(patcher)
    }

    private suspend fun seed(conversation: ApiConversation) {
        db.conversationDao().upsertAll(
            listOf(
                ConversationEntity(
                    id = conversation.id,
                    payload = MeeshyApi.json.encodeToString(conversation),
                    updatedAt = 1_000L,
                    cachedAt = 1L,
                    unreadCount = conversation.unreadCount,
                ),
            ),
        )
    }

    private suspend fun stored(id: String): ApiConversation? =
        db.conversationDao().find(id)?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }

    private fun group() = ApiConversation(
        id = "c1", type = "group", title = "Team",
        lastMessage = ApiConversationLastMessage(
            id = "m1", content = "old", senderName = "Alice", createdAt = "2026-10-01T10:00:00.000Z",
        ),
    )

    @Test
    fun `updated applique titre et apercu en place sans toucher au reseau`() = runTest {
        seed(group())
        val event = ConversationUpdatedSocketEvent(
            conversationId = "c1", title = "Renamed",
            lastMessageId = PreviewFieldUpdate.Replaced("m2"), lastMessagePreview = "Hello",
            lastMessageAt = "2026-10-01T11:00:00.000Z",
        )
        applier().applyUpdated(event)
        val row = stored("c1")!!
        assertThat(row.title).isEqualTo("Renamed")
        assertThat(row.lastMessage?.content).isEqualTo("Hello")
    }

    @Test
    fun `updated avec identite nulle efface l apercu`() = runTest {
        seed(group())
        applier().applyUpdated(
            ConversationUpdatedSocketEvent(conversationId = "c1", lastMessageId = PreviewFieldUpdate.Replaced(null)),
        )
        assertThat(stored("c1")!!.lastMessage?.content).isNull()
    }

    @Test
    fun `restored ramene la conversation par id`() = runBlocking {
        val api = mockk<ConversationApi>()
        coEvery { api.getById("c9") } returns ApiResponse(success = true, data = ApiConversation(id = "c9", type = "group"))
        applier(api).applyRestored(ConversationRestoredSocketEvent(conversationId = "c9"))
        assertThat(stored("c9")).isNotNull()
    }

    @Test
    fun `la ligne en base est celle que la regle de fusion calcule`() = runTest {
        val before = group()
        seed(before)
        val event = ConversationUpdatedSocketEvent(
            conversationId = "c1", title = "Renamed", description = "d",
            lastMessageId = PreviewFieldUpdate.Replaced("m2"), lastMessagePreview = "Hello",
            lastMessageAt = "2026-10-01T11:00:00.000Z",
        )
        applier().applyUpdated(event)
        val expected = ConversationMergeRules.updated(before, event, "me", "Vous")
        assertThat(stored("c1")).isEqualTo(expected)
    }
}
