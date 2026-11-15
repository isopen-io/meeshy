package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import org.junit.After
import org.junit.Test

/**
 * #13580 — le CÂBLAGE de production des écritures de post reçues par socket : un `post:updated` ou un
 * `post:translation-updated` que la socket de A a reçu, collecté après l'adoption de B, n'écrit rien chez B.
 * Aucun `withAccountTicket` ici : le ticket voyage avec l'événement.
 */
class PostRealtimeArrivalAccountTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val laneScheduler = TestCoroutineScheduler()
    private val collectorScheduler = TestCoroutineScheduler()
    private val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
    private val api: PostApi = mockk(relaxed = true)
    private val repository = PostRepository(api, mockk(relaxed = true), mockk(relaxed = true), fence = fence)

    private fun socialManager(): SocialSocketManager {
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(
            SocketEventRegistrar { event, callback -> socket.on(event, callback) },
            StandardTestDispatcher(laneScheduler),
            { transition.generation },
            { fence.ticket() },
        )
        return SocialSocketManager(socket, json, router).also { it.attach() }
    }

    private suspend fun seedFeed(liked: Boolean) {
        coEvery { api.getFeed(any(), any()) } returns ApiResponse(
            success = true,
            data = listOf(ApiPost(id = "p1", content = "avant", originalLanguage = "fr", isLikedByMe = liked)),
        )
        repository.refresh()
    }

    private fun receive(event: String, payload: String) {
        handlers.getValue(event).invoke(arrayOf(JSONObject(payload)))
        laneScheduler.advanceUntilIdle()
    }

    private fun switchToB() = runBlocking {
        owner.id = null
        transition.bumpGeneration()
        fence.close { repository.clear() }
        owner.id = "B"
        transition.bumpGeneration()
        seedFeed(liked = false)
    }

    private val collectors = CoroutineScope(SupervisorJob())

    @After
    fun stopCollectors() = collectors.cancel()

    private fun collecting(block: suspend () -> Unit) =
        collectors.launch(StandardTestDispatcher(collectorScheduler), start = CoroutineStart.UNDISPATCHED) { block() }

    private val edit = """{"post":{"id":"p1","content":"modifié par A","originalLanguage":"fr"}}"""
    private val translation = """{"postId":"p1","language":"es","translation":{"text":"Hola"}}"""

    @Test
    fun `an edit that arrived on A's socket and is collected after B signed in writes nothing`(): Unit = runBlocking {
        seedFeed(liked = true)
        val social = socialManager()
        collecting { social.writePostUpdatesTo(repository) }
        receive("post:updated", edit)

        switchToB()
        collectorScheduler.advanceUntilIdle()

        assertThat(repository.cachedPost("p1")!!.content).isEqualTo("avant")
    }

    @Test
    fun `an edit that arrived on the current account's socket is written`(): Unit = runBlocking {
        seedFeed(liked = true)
        val social = socialManager()
        collecting { social.writePostUpdatesTo(repository) }

        receive("post:updated", edit)
        collectorScheduler.advanceUntilIdle()

        assertThat(repository.cachedPost("p1")!!.content).isEqualTo("modifié par A")
    }

    @Test
    fun `a translation that arrived on A's socket and is collected after B signed in writes nothing`(): Unit = runBlocking {
        seedFeed(liked = true)
        val social = socialManager()
        collecting { social.writePostTranslationsTo(repository) }
        receive("post:translation-updated", translation)

        switchToB()
        collectorScheduler.advanceUntilIdle()

        assertThat(repository.cachedPost("p1")!!.translations).isNull()
    }

    @Test
    fun `a translation that arrived on the current account's socket is written`(): Unit = runBlocking {
        seedFeed(liked = true)
        val social = socialManager()
        collecting { social.writePostTranslationsTo(repository) }

        receive("post:translation-updated", translation)
        collectorScheduler.advanceUntilIdle()

        assertThat(repository.cachedPost("p1")!!.translations!!["es"]!!.text).isEqualTo("Hola")
    }
}
