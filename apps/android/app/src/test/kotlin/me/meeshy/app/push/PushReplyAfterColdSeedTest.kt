package me.meeshy.app.push

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.conversation.ConversationRefreshSignal
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.MinimalMessageIngest
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MinimalMessageSeed
import me.meeshy.sdk.model.push.PushPayload
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.ConversationModeRead
import me.meeshy.sdk.outbox.ConversationModeReader
import me.meeshy.sdk.outbox.EndToEndOutboxAdmission
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13792 — application tuée, un message chiffré de bout en bout arrive par FCM. La donnée du push ne dit pas le bout en bout
 * (aucun `encryptionMode` ni `isEncrypted` dans `data`, passerelle `NotificationService.createNotification` ; le seul
 * `notificationLocKey` couvre aussi le chiffré au repos, l'éphémère et la vue unique) : la graine s'écrit sans régime, et la
 * conversation reste « server » en cache. La réponse depuis la bannière relit donc le mode au serveur avant d'admettre.
 *
 * `runBlocking` et non `runTest` : Room répond sur ses propres fils, et le temps virtuel ferait tomber à l'instant le budget
 * de relecture (`withTimeoutOrNull`) du récepteur.
 */
@RunWith(RobolectricTestRunner::class)
class PushReplyAfterColdSeedTest {

    private val me = MeeshyUser(id = "me", username = "me")
    private val database: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()
    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 1_700_000_000_000L
    }

    @After
    fun tearDown() = database.close()

    private suspend fun cacheServerConversation() = database.conversationDao().upsertAll(
        listOf(
            ConversationEntity(
                id = CONVERSATION,
                payload = MeeshyApi.json.encodeToString(ApiConversation(id = CONVERSATION, type = "direct", encryptionMode = "server")),
                updatedAt = 0,
                cachedAt = 0,
            ),
        ),
    )

    /** Ce que FCM remet d'un message e2ee : la clé de protection, aucun mode. */
    private fun coldPushSeed(): MinimalMessageSeed = requireNotNull(
        MinimalMessageSeed.fromPush(
            PushPayload(
                type = "new_message",
                messageId = "m-e2ee",
                conversationId = CONVERSATION,
                senderId = "u-peer",
                body = "🔒 💬",
                createdAt = "2026-10-29T10:00:00.000Z",
                notificationLocKey = "notification.encrypted_message",
            ),
        ),
    )

    private class Wiring(val handler: PushNotificationActionHandler, val messages: MessageRepository)

    private fun wiring(reader: ConversationModeReader): Wiring {
        val messages = mockk<MessageRepository>(relaxed = true)
        val session = mockk<me.meeshy.sdk.session.SessionRepository>(relaxed = true) {
            every { currentUser } returns MutableStateFlow(me)
        }
        val admission = EndToEndOutboxAdmission(
            InMemoryEndToEndRegimeLedger(),
            database.conversationDao(),
            database.messageDao(),
            OutboxRepository(database, database.outboxDao()),
            reader,
        )
        val handler = PushNotificationActionHandler(
            ApplicationProvider.getApplicationContext<Context>(),
            session,
            messages,
            mockk(relaxed = true),
            admission,
            mockk(relaxed = true),
            mockk(relaxed = true),
            InMemoryConversationLockStore(),
            InMemoryConversationDraftStore(),
        )
        return Wiring(handler, messages)
    }

    private fun served(mode: String?) = ConversationModeReader { id ->
        ConversationModeRead.Served(ApiConversation(id = id, type = "direct", encryptionMode = mode))
    }

    @Test
    fun `application tuee, graine FCM d un message e2ee sur un cache server, le serveur dit e2ee - rien ne part en clair`() = runBlocking {
        cacheServerConversation()
        assertThat(MinimalMessageIngest(database, clock, ConversationRefreshSignal()).ingest(coldPushSeed())).isTrue()
        val wired = wiring(served("e2ee"))

        val outcome = wired.handler.reply(CONVERSATION, "secret")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.END_TO_END)
        coVerify(exactly = 0) { wired.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `application tuee, graine FCM sur un cache server, le serveur dit clair - la reponse part`() = runBlocking {
        cacheServerConversation()
        MinimalMessageIngest(database, clock, ConversationRefreshSignal()).ingest(coldPushSeed())
        val wired = wiring(served("server"))

        val outcome = wired.handler.reply(CONVERSATION, "salut")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.SENT)
        coVerify(exactly = 1) { wired.messages.sendOptimistic(conversationId = CONVERSATION, content = "salut", originalLanguage = any(), sender = me) }
    }

    @Test
    fun `application tuee, graine FCM sur un cache server, le mode ne se relit pas - brouillon, jamais d envoi`() = runBlocking {
        cacheServerConversation()
        MinimalMessageIngest(database, clock, ConversationRefreshSignal()).ingest(coldPushSeed())
        val wired = wiring(ConversationModeReader.Unavailable)

        val outcome = wired.handler.reply(CONVERSATION, "salut")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.DRAFT_KEPT)
        coVerify(exactly = 0) { wired.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    private companion object {
        const val CONVERSATION = "c-direct"
    }
}
