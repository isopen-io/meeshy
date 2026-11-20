package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CommunityJoinRequestedEvent
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** `community:join-requested` (#19878) s'annonce à qui l'écoute, dans l'ordre d'arrivée, une fois attaché. */
@RunWith(RobolectricTestRunner::class)
class CommunityJoinRequestedBindingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = StandardTestDispatcher(scheduler)

    private fun wired(): Pair<CommunityJoinRequestedBinding, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, dispatcher)
        return CommunityJoinRequestedBinding(router, json) to handlers
    }

    @Test
    fun `rien n ecoute avant l attache`() {
        val (_, handlers) = wired()
        assertThat(handlers).doesNotContainKey("community:join-requested")
    }

    @Test
    fun `chaque annonce lisible arrive dans l ordre, une charge sans communaute est ecartee`() = runTest(dispatcher) {
        val (binding, handlers) = wired()
        val seen = mutableListOf<CommunityJoinRequestedEvent>()
        val job = launch { binding.requested.toList(seen) }
        binding.attach()
        scheduler.advanceUntilIdle()

        val handler = handlers.getValue("community:join-requested")
        handler(arrayOf(JSONObject("""{"communityId":"c1","requestId":"r1","userId":"u1","pendingCount":1,"at":"2026-11-20T10:00:00.000Z"}""")))
        handler(arrayOf(JSONObject("""{"communityId":"","requestId":"r2"}""")))
        handler(arrayOf(JSONObject("""{"communityId":"c2","requestId":"r3","userId":"u3","pendingCount":4}""")))
        scheduler.advanceUntilIdle()

        assertThat(seen.map { it.communityId }).containsExactly("c1", "c2").inOrder()
        job.cancel()
        binding.detach()
    }
}
