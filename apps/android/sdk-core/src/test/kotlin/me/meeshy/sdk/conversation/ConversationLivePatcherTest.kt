package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantJoinedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantUnbannedEvent
import me.meeshy.sdk.model.preview.PreviewFieldUpdate
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.session.SessionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConversationLivePatcherTest {

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

    private fun patcher(api: ConversationApi = mockk(), me: String = "me"): ConversationLivePatcher {
        val session = mockk<SessionRepository> {
            every { currentUser } returns MutableStateFlow(MeeshyUser(id = me, username = me, systemLanguage = "fr"))
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
        )
    }

    private suspend fun seed(conversation: ApiConversation, updatedAt: Long = 1_000L) {
        db.conversationDao().upsertAll(
            listOf(
                ConversationEntity(
                    id = conversation.id,
                    payload = MeeshyApi.json.encodeToString(conversation),
                    updatedAt = updatedAt,
                    cachedAt = 1L,
                    unreadCount = conversation.unreadCount,
                ),
            ),
        )
    }

    private suspend fun stored(id: String): ApiConversation? =
        db.conversationDao().find(id)?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it.payload) }

    private fun group(id: String = "c1") = ApiConversation(
        id = id,
        type = "group",
        serverMemberCount = 3,
        lastMessage = ApiConversationLastMessage(
            id = "m1", content = "old", senderName = "Alice", createdAt = "2026-10-01T10:00:00.000Z",
        ),
    )

    private fun incoming(
        id: String = "m2",
        createdAt: String = "2026-10-01T11:00:00.000Z",
        sender: String = "bob",
    ) = ApiMessage(
        id = id, conversationId = "c1", senderId = sender, content = "Hello", createdAt = createdAt,
        sender = ApiMessageSender(userId = sender, displayName = sender.replaceFirstChar { it.uppercase() }),
        originalLanguage = "en",
        translations = listOf(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour")),
    )

    @Test
    fun `an incoming message patches the row and bumps its rank without any network call`() = runTest {
        val api = mockk<ConversationApi>()
        seed(group())

        patcher(api).applyMessage(incoming())

        val row = stored("c1")!!
        assertThat(row.lastMessage?.id).isEqualTo("m2")
        assertThat(row.lastMessage?.senderName).isEqualTo("Bob")
        assertThat(row.lastMessageTranslations).containsExactly("fr", "Bonjour")
        assertThat(db.conversationDao().find("c1")!!.updatedAt).isGreaterThan(1_000L)
        coVerify(exactly = 0) { api.getById(any()) }
    }

    @Test
    fun `a frame older than the known last message does not roll the preview back`() = runTest {
        seed(group())

        patcher().applyMessage(incoming(id = "m0", createdAt = "2026-10-01T09:00:00.000Z"))

        assertThat(stored("c1")!!.lastMessage?.id).isEqualTo("m1")
    }

    @Test
    fun `my own message says You`() = runTest {
        seed(group())

        patcher().applyMessage(incoming(sender = "me"))

        assertThat(stored("c1")!!.lastMessage?.senderName).isEqualTo("Vous")
    }

    @Test
    fun `a conversation update patches the title in place`() = runTest {
        seed(group())

        patcher().applyUpdated(ConversationUpdatedSocketEvent(conversationId = "c1", title = "Renamed"))

        assertThat(stored("c1")!!.title).isEqualTo("Renamed")
    }

    @Test
    fun `an erased last message clears the preview`() = runTest {
        seed(group())

        patcher().applyUpdated(
            ConversationUpdatedSocketEvent(conversationId = "c1", lastMessageId = PreviewFieldUpdate.Replaced(null)),
        )

        assertThat(stored("c1")!!.lastMessage).isNull()
    }

    @Test
    fun `unread count is written to the row and its denormalized column`() = runTest {
        seed(group())

        patcher().applyUnread("c1", 4)

        assertThat(stored("c1")!!.unreadCount).isEqualTo(4)
        assertThat(db.conversationDao().find("c1")!!.unreadCount).isEqualTo(4)
    }

    @Test
    fun `an unknown conversation is fetched by id once, even for concurrent frames, and inserted`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = mockk<ConversationApi>()
        coEvery { api.getById("c9") } coAnswers {
            gate.await()
            ApiResponse(success = true, data = ApiConversation(id = "c9", title = "New"))
        }
        val p = patcher(api)

        val first = async { p.applyUpdated(ConversationUpdatedSocketEvent(conversationId = "c9")) }
        val second = async { p.applyPush("added_to_conversation", "c9") }
        val third = async { p.discover("c9") }
        gate.complete(Unit)
        first.await(); second.await(); third.await()

        coVerify(exactly = 1) { api.getById("c9") }
        assertThat(stored("c9")?.title).isEqualTo("New")
    }

    @Test
    fun `a push of an unrelated type discovers nothing`() = runTest {
        val api = mockk<ConversationApi>()

        patcher(api).applyPush("new_message", "c9")

        coVerify(exactly = 0) { api.getById(any()) }
    }

    @Test
    fun `member joined adds one, myself ignored, server absolute count wins`() = runTest {
        seed(group())
        val p = patcher()

        p.applyJoined(ParticipantJoinedEvent(conversationId = "c1", userId = "me"))
        assertThat(stored("c1")!!.memberCount).isEqualTo(3)

        p.applyJoined(ParticipantJoinedEvent(conversationId = "c1", userId = "x"))
        assertThat(stored("c1")!!.memberCount).isEqualTo(4)

        p.applyJoined(ParticipantJoinedEvent(conversationId = "c1", userId = "y", memberCount = 9))
        assertThat(stored("c1")!!.memberCount).isEqualTo(9)
    }

    @Test
    fun `another member leaving or being banned removes one, unbanned gives it back`() = runTest {
        seed(group())
        val p = patcher()

        p.applyLeft(ParticipantLeftEvent(conversationId = "c1", userId = "x"))
        assertThat(stored("c1")!!.memberCount).isEqualTo(2)
        p.applyBanned(ParticipantBannedEvent(conversationId = "c1", userId = "y"))
        assertThat(stored("c1")!!.memberCount).isEqualTo(1)
        p.applyUnbanned(ParticipantUnbannedEvent(conversationId = "c1", userId = "y"))
        assertThat(stored("c1")!!.memberCount).isEqualTo(2)
    }

    @Test
    fun `being banned or leaving removes the row and invalidates its cached messages`() = runTest {
        seed(group("c1"))
        seed(group("c2"))
        val p = patcher()

        p.applyBanned(ParticipantBannedEvent(conversationId = "c1", userId = "me"))
        p.applyLeft(ParticipantLeftEvent(conversationId = "c2", userId = "me"))

        assertThat(stored("c1")).isNull()
        assertThat(stored("c2")).isNull()
    }
}
