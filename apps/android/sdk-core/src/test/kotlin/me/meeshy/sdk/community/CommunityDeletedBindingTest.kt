package me.meeshy.sdk.community

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CommunityDeletedEvent
import me.meeshy.sdk.socket.SocketEventRegistrar
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** `community:deleted` (#19592) atteint le cache des communautés, dans l'ordre d'arrivée, une fois attaché. */
@RunWith(RobolectricTestRunner::class)
class CommunityDeletedBindingTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }
    private val scheduler = TestCoroutineScheduler()
    private val dispatcher = StandardTestDispatcher(scheduler)

    private fun wired(applied: MutableList<CommunityDeletedEvent>): Pair<CommunityDeletedBinding, Map<String, (Array<Any>) -> Unit>> {
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        val socket: SocketManager = mockk(relaxed = true)
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        val router = SocketEventRouter(SocketEventRegistrar { event, callback -> socket.on(event, callback) }, dispatcher)
        val binding = CommunityDeletedBinding(router, json, dispatcher) { applied += it }
        return binding to handlers
    }

    private fun payload(id: String, reason: String = "deleted") =
        JSONObject("""{"communityId":"$id","reason":"$reason","at":"2026-11-18T08:00:00.000Z"}""")

    @Test
    fun `rien n ecoute avant l attache`() {
        val (_, handlers) = wired(mutableListOf())
        assertThat(handlers).doesNotContainKey("community:deleted")
    }

    @Test
    fun `chaque disparition est appliquee au cache dans l ordre d arrivee`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityDeletedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()

        handlers.getValue("community:deleted").invoke(arrayOf(payload("c1")))
        handlers.getValue("community:deleted").invoke(arrayOf(payload("c2", "deactivated")))
        scheduler.advanceUntilIdle()

        assertThat(applied.map { it.communityId to it.reason }).containsExactly("c1" to "deleted", "c2" to "deactivated").inOrder()
        binding.detach()
    }

    @Test
    fun `une charge illisible est ignoree sans couper le flux`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityDeletedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()

        handlers.getValue("community:deleted").invoke(arrayOf(JSONObject("""{"reason":"deleted"}""")))
        handlers.getValue("community:deleted").invoke(arrayOf(JSONObject("""{"communityId":"","reason":"deleted"}""")))
        handlers.getValue("community:deleted").invoke(arrayOf(payload("c3")))
        scheduler.advanceUntilIdle()

        assertThat(applied.map { it.communityId }).containsExactly("c3")
        binding.detach()
    }

    @Test
    fun `apres la deconnexion plus rien n est applique`() = runTest(dispatcher) {
        val applied = mutableListOf<CommunityDeletedEvent>()
        val (binding, handlers) = wired(applied)
        binding.attach()
        scheduler.advanceUntilIdle()
        binding.detach()

        handlers["community:deleted"]?.invoke(arrayOf(payload("c1")))
        scheduler.advanceUntilIdle()

        assertThat(applied).isEmpty()
    }
}
