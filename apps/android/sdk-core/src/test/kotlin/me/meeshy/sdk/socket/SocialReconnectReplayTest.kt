package me.meeshy.sdk.socket

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.serialization.json.Json
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SocialReconnectReplayTest {

    private fun socketWithConnection(): Pair<SocketManager, MutableSharedFlow<Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val connected = MutableSharedFlow<Unit>(replay = 1)
        every { socket.connected } returns connected
        return socket to connected
    }

    @Test
    fun `le fil et chaque salle tenue sont rejoues une fois a la connexion`() {
        val (socket, connected) = socketWithConnection()
        val manager = SocialSocketManager(socket, Json)
        manager.subscribeFeed()
        manager.joinPostRoom("p1")
        manager.joinPostRoom("p1")
        manager.joinPostRoom("p2")
        connected.tryEmit(Unit)

        manager.attach()

        verify(timeout = 3_000, exactly = 2) { socket.emit("feed:subscribe", any<JSONObject>()) }
        verify(timeout = 3_000, exactly = 2) { socket.emit("post:join", match<JSONObject> { it.getString("postId") == "p1" }) }
        verify(timeout = 3_000, exactly = 2) { socket.emit("post:join", match<JSONObject> { it.getString("postId") == "p2" }) }
    }

    @Test
    fun `une salle quittee n'est pas rejouee et le fil desabonne non plus`() {
        val (socket, connected) = socketWithConnection()
        val manager = SocialSocketManager(socket, Json)
        manager.subscribeFeed()
        manager.unsubscribeFeed()
        manager.joinPostRoom("p1")
        manager.leavePostRoom("p1")
        connected.tryEmit(Unit)

        manager.attach()
        Thread.sleep(300)

        verify(exactly = 1) { socket.emit("feed:subscribe", any<JSONObject>()) }
        verify(exactly = 1) { socket.emit("post:join", any<JSONObject>()) }
    }

    @Test
    fun `n ecrans sur le meme post ne quittent la salle qu'a la derniere sortie`() {
        val (socket, _) = socketWithConnection()
        val manager = SocialSocketManager(socket, Json)
        manager.joinPostRoom("p1")
        manager.joinPostRoom("p1")
        manager.leavePostRoom("p1")
        verify(exactly = 0) { socket.emit("post:leave", any<JSONObject>()) }
        manager.leavePostRoom("p1")
        verify(exactly = 1) { socket.emit("post:leave", any<JSONObject>()) }
    }
}
