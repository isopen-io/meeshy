package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CommunityUpdatedEvent
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** `community:updated` atteint le cache des communautés, dans l'ordre d'arrivée, une fois attaché. */
@RunWith(RobolectricTestRunner::class)
class CommunityUpdateBindingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = StandardTestDispatcher(scheduler)

    private fun wired(applied: MutableList<CommunityUpdatedEvent>): Pair<CommunityUpdateBinding, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, dispatcher)
        val binding = CommunityUpdateBinding(router, json, dispatcher) { applied += it }
        return binding to handlers
    }

    private fun payload(name: String) = JSONObject(
        """{"communityId":"c1","identifier":"mshy_c1","name":"$name","description":null,"avatar":null,
           "banner":null,"isPrivate":true,"memberCount":2,"updatedAt":"2026-11-15T12:00:00.000Z"}""",
    )

    @Test
    fun `rien n ecoute avant l attache`() {
        val (_, handlers) = wired(mutableListOf())
        assertThat(handlers).doesNotContainKey("community:updated")
    }

    @Test
    fun `chaque evenement est applique au cache dans l ordre d arrivee`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityUpdatedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()

        handlers.getValue("community:updated").invoke(arrayOf(payload("Un")))
        handlers.getValue("community:updated").invoke(arrayOf(payload("Deux")))
        scheduler.advanceUntilIdle()

        assertThat(applied.map { it.name }).containsExactly("Un", "Deux").inOrder()
        binding.detach()
    }

    @Test
    fun `une charge illisible est ignoree sans couper le flux`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityUpdatedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()

        handlers.getValue("community:updated").invoke(arrayOf(JSONObject("""{"communityId":"c1"}""")))
        handlers.getValue("community:updated").invoke(arrayOf(payload("Lisible")))
        scheduler.advanceUntilIdle()

        assertThat(applied.map { it.name }).containsExactly("Lisible")
        binding.detach()
    }

    @Test
    fun `apres la deconnexion plus rien n est applique`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityUpdatedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        binding.detach()

        handlers.getValue("community:updated").invoke(arrayOf(payload("Tard")))
        scheduler.advanceUntilIdle()

        assertThat(applied).isEmpty()
    }
}
