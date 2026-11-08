package me.meeshy.sdk.socket

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.conversation.OpenConversationRegistry
import me.meeshy.sdk.conversation.ParticipantCacheRepository
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ConversationRoomRegistryTest {

    private class Harness(scheduler: TestCoroutineScheduler, connectedNow: Boolean = true) {
        val emitted = mutableListOf<Pair<String, String>>()
        val callbacks = mutableMapOf<String, (Array<Any>) -> Unit>()
        val connected = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
        var isConnected = connectedNow
        val participants: ParticipantCacheRepository = mockk(relaxed = true)
        val socket: SocketManager = mockk(relaxed = true) {
            every { this@mockk.connected } returns this@Harness.connected
            every { this@mockk.isConnected } answers { this@Harness.isConnected }
            every { emit(any<String>(), any<JSONObject>()) } answers {
                emitted += firstArg<String>() to secondArg<JSONObject>().getString("conversationId")
            }
            every { on(any(), any()) } answers { callbacks[firstArg<String>()] = secondArg<(Array<Any>) -> Unit>() }
        }
        val registry = ConversationRoomRegistry(socket, participants, Json { ignoreUnknownKeys = true }, StandardTestDispatcher(scheduler))
        val opens = OpenConversationRegistry(registry)

        fun reconnect(scheduler: TestCoroutineScheduler) {
            isConnected = true
            connected.tryEmit(Unit)
            scheduler.runCurrent()
        }
    }

    @Test
    fun `ouvrir une conversation emet join une fois et la fermer emet leave`() = runTest {
        val h = Harness(testScheduler)
        h.registry.attach()
        h.opens.open("a")
        h.opens.close("a")
        assertThat(h.emitted).containsExactly("conversation:join" to "a", "conversation:leave" to "a").inOrder()
    }

    @Test
    fun `une conversation ouverte deux fois puis fermee une fois reste dans la salle`() = runTest {
        val h = Harness(testScheduler)
        h.registry.attach()
        h.opens.open("a")
        h.opens.open("a")
        h.opens.close("a")
        assertThat(h.emitted).containsExactly("conversation:join" to "a")
        assertThat(h.registry.joinedRooms).containsExactly("a")
        h.opens.close("a")
        assertThat(h.emitted.last()).isEqualTo("conversation:leave" to "a")
    }

    @Test
    fun `hors connexion l'ensemble est memorise et rejoue au connect, active d'abord`() = runTest {
        val h = Harness(testScheduler, connectedNow = false)
        h.registry.attach()
        testScheduler.runCurrent()
        h.opens.open("b")
        h.opens.open("a")
        h.registry.join("z")
        h.opens.open("b")
        assertThat(h.emitted).isEmpty()
        h.reconnect(testScheduler)
        assertThat(h.emitted.map { it.second }).containsExactly("b", "a", "z").inOrder()
        assertThat(h.emitted.map { it.first }.toSet()).containsExactly("conversation:join")
    }

    @Test
    fun `une erreur de jointure invalide le cache des participants et se montre`() = runTest {
        val h = Harness(testScheduler)
        h.registry.attach()
        val refusals = mutableListOf<String?>()
        val job = launch(kotlinx.coroutines.Dispatchers.Unconfined) {
            h.registry.refusals.collect { refusals += it.reason }
        }
        h.opens.open("a")
        h.callbacks.getValue("conversation:join-error")(
            arrayOf(JSONObject("""{"conversationId":"a","reason":"banned","message":"non"}""")),
        )
        testScheduler.runCurrent()
        coVerify { h.participants.invalidate("a") }
        assertThat(refusals).containsExactly("banned")
        assertThat(h.registry.joinedRooms).isEmpty()
        job.cancel()
    }
}
