package me.meeshy.sdk.notification

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.conversation.ConversationRefreshSignal
import me.meeshy.sdk.conversation.MessageEntityFactory
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.push.PushPayload
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PushPrefetchRepositoryTest {

    private class Setup(signedIn: Boolean = true) {
        val database: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        val messageApi = mockk<MessageApi>()
        val conversationApi = mockk<ConversationApi>(relaxed = true)
        val prefetchedPosts = mutableListOf<String>()
        val tokens: TokenStore = InMemoryTokenStore().apply {
            if (signedIn) {
                jwt = "jwt"
                userId = "me"
            }
        }
        val repository = PushPrefetchRepository(
            database = database,
            clock = object : CacheClock { override fun nowMillis() = 42L },
            signal = ConversationRefreshSignal(),
            messageApi = messageApi,
            conversationApi = conversationApi,
            posts = PushPostPrefetcher { prefetchedPosts += it },
            tokenStore = tokens,
        )

        fun serve(message: ApiMessage) {
            coEvery { messageApi.listAround("c1", "m1", any()) } returns ApiResponse(success = true, data = listOf(message))
        }
    }

    private fun message(content: String = "Hello") =
        ApiMessage(id = "m1", conversationId = "c1", senderId = "u1", content = content, createdAt = "2026-06-01T10:00:00Z")

    private fun push(type: String, postId: String? = null) =
        PushPayload(type = type, conversationId = "c1", messageId = "m1", postId = postId)

    @Test
    fun `an arriving message is inserted with its original content and acknowledged`() = runTest {
        val s = Setup().also { it.serve(message("Hello")) }

        s.repository.prefetch(push("new_message"))

        assertThat(s.database.messageDao().find("m1")?.payload).contains("Hello")
        coVerify { s.conversationApi.markReceived("c1") }
    }

    @Test
    fun `an existing row is never replaced`() = runTest {
        val s = Setup().also { it.serve(message("Hello")) }
        s.database.messageDao().upsertAll(listOf(MessageEntityFactory.cached(message("Rich"), 1L)))

        s.repository.prefetch(push("message_reply"))

        assertThat(s.database.messageDao().find("m1")?.payload).contains("Rich")
    }

    @Test
    fun `a reaction writes nothing and fetches nothing`() = runTest {
        val s = Setup()

        s.repository.prefetch(push("message_reaction"))

        assertThat(s.database.messageDao().find("m1")).isNull()
        coVerify(exactly = 0) { s.messageApi.listAround(any(), any(), any()) }
        coVerify(exactly = 0) { s.conversationApi.markReceived(any()) }
    }

    @Test
    fun `nothing is written without a signed-in user`() = runTest {
        val s = Setup(signedIn = false).also { it.serve(message()) }

        s.repository.prefetch(push("new_message"))

        assertThat(s.database.messageDao().find("m1")).isNull()
        coVerify(exactly = 0) { s.messageApi.listAround(any(), any(), any()) }
    }

    @Test
    fun `a network failure is swallowed and the post is still prefetched`() = runTest {
        val s = Setup()
        coEvery { s.messageApi.listAround(any(), any(), any()) } throws java.io.IOException("offline")

        s.repository.prefetch(push("new_message"))
        s.repository.prefetch(PushPayload(type = "post_comment", postId = "p9"))

        assertThat(s.database.messageDao().find("m1")).isNull()
        assertThat(s.prefetchedPosts).containsExactly("p9")
    }

    @Test
    fun `a plaintext message in an end-to-end conversation is refused`() = runTest {
        val s = Setup().also { it.serve(message("clair")) }

        s.repository.prefetch(push("new_message").copy(conversationEncryptionMode = "e2ee"))

        assertThat(s.database.messageDao().find("m1")).isNull()
    }
}
