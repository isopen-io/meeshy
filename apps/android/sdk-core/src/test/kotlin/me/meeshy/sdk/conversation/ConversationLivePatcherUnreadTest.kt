package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConversationLivePatcherUnreadTest {
    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    private fun patcher(open: Set<String> = emptySet(), api: ConversationApi = mockk()): ConversationLivePatcher {
        val session = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
        }
        return ConversationLivePatcher(
            database = db,
            conversationDao = db.conversationDao(),
            messageDao = db.messageDao(),
            conversationApi = api,
            session = session,
            readerLabel = object : ReaderLabelProvider {
                override fun youLabel(): String = "Vous"
            },
            openConversations = OpenConversationLookup { it in open },
        )
    }

    private suspend fun seed(unread: Int = 0) {
        val conversation = ApiConversation(
            id = "c1", type = "group", unreadCount = unread,
            lastMessage = ApiConversationLastMessage(id = "m0", content = "old", createdAt = "2026-10-01T10:00:00.000Z"),
        )
        db.conversationDao().upsertAll(
            listOf(ConversationEntity("c1", MeeshyApi.json.encodeToString(conversation), 1_000L, 1L, unread)),
        )
    }

    private suspend fun stored(): ApiConversation =
        MeeshyApi.json.decodeFromString(db.conversationDao().find("c1")!!.payload)

    private fun message(id: String = "m1", sender: String = "bob") = ApiMessage(
        id = id, conversationId = "c1", senderId = sender, content = "salut", createdAt = "2026-10-01T11:00:00.000Z",
    )

    @Test
    fun `un message recu conversation fermee monte le non-lu une seule fois`() = runTest {
        seed(unread = 1)
        val patcher = patcher()
        patcher.applyMessage(message())
        patcher.applyMessage(message())
        assertThat(stored().unreadCount).isEqualTo(2)
        assertThat(db.conversationDao().find("c1")!!.unreadCount).isEqualTo(2)
    }

    @Test
    fun `conversation ouverte ou message de soi ne montent pas le non-lu`() = runTest {
        seed()
        patcher(open = setOf("c1")).applyMessage(message())
        assertThat(stored().unreadCount).isEqualTo(0)
        seed()
        patcher().applyMessage(message(id = "m2", sender = "me"))
        assertThat(stored().unreadCount).isEqualTo(0)
    }

    @Test
    fun `une conversation absente est recuperee par getById sans ecrire quand le reseau echoue`() = runTest {
        val api = mockk<ConversationApi>()
        io.mockk.coEvery { api.getById("c1") } throws java.io.IOException("hors ligne")
        patcher(api = api).applyMessage(message())
        assertThat(db.conversationDao().find("c1")).isNull()
        coVerify(exactly = 1) { api.getById("c1") }
    }
}
