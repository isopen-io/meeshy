package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CommunityJoinRequestDecidedEvent
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** `community:join-request-decided` (#19949) atteint le cache des communautés, dans l'ordre d'arrivée, une fois attaché. */
@RunWith(RobolectricTestRunner::class)
class CommunityJoinRequestDecidedBindingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = StandardTestDispatcher(scheduler)

    private fun wired(applied: MutableList<CommunityJoinRequestDecidedEvent>): Pair<CommunityJoinRequestDecidedBinding, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, dispatcher)
        val binding = CommunityJoinRequestDecidedBinding(router, json, dispatcher) { applied += it }
        return binding to handlers
    }

    private fun payload(retryAt: String) = JSONObject(
        """{"communityId":"c1","decision":"rejected","retryAt":"$retryAt","at":"2026-11-20T11:00:00.000Z"}""",
    )

    @Test
    fun `rien n ecoute avant l attache`() {
        val (_, handlers) = wired(mutableListOf())
        assertThat(handlers).doesNotContainKey("community:join-request-decided")
    }

    @Test
    fun `chaque evenement est applique au cache dans l ordre d arrivee`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityJoinRequestDecidedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()

        handlers.getValue("community:join-request-decided").invoke(arrayOf(payload("2026-11-27T11:00:00.000Z")))
        handlers.getValue("community:join-request-decided").invoke(arrayOf(payload("2026-11-28T11:00:00.000Z")))
        scheduler.advanceUntilIdle()

        assertThat(applied.map { it.retryAt }).containsExactly("2026-11-27T11:00:00.000Z", "2026-11-28T11:00:00.000Z").inOrder()
        binding.detach()
    }

    @Test
    fun `une charge illisible est ignoree sans couper le flux`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityJoinRequestDecidedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()

        handlers.getValue("community:join-request-decided").invoke(arrayOf(JSONObject("""{"retryAt":"2026-11-27T11:00:00.000Z"}""")))
        handlers.getValue("community:join-request-decided").invoke(arrayOf(payload("2026-11-29T11:00:00.000Z")))
        scheduler.advanceUntilIdle()

        assertThat(applied.map { it.retryAt }).containsExactly("2026-11-29T11:00:00.000Z")
        binding.detach()
    }

    @Test
    fun `apres la deconnexion plus rien n est applique`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityJoinRequestDecidedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        binding.detach()

        handlers.getValue("community:join-request-decided").invoke(arrayOf(payload("2026-11-30T11:00:00.000Z")))
        scheduler.advanceUntilIdle()

        assertThat(applied).isEmpty()
    }
}
