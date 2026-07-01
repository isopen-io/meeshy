package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallInitiateResult
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CallSignalManagerTest {

    private fun managerWithHandlers(): Pair<Pair<CallSignalManager, SocketManager>, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers {
            handlers[firstArg()] = secondArg()
        }
        val manager = CallSignalManager(socket)
        manager.attach()
        return (manager to socket) to handlers
    }

    private fun deliver(handlers: Map<String, (Array<Any>) -> Unit>, event: String, json: String) {
        handlers.getValue(event).invoke(arrayOf(JSONObject(json)))
    }

    // --- Inbound: each frame maps to the FSM event the mapper decides ---

    @Test
    fun `call initiated maps to ReceiveIncoming`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:initiated", """{"callId":"c1","type":"video"}""")
            assertThat(awaitItem()).isEqualTo(CallEvent.ReceiveIncoming)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `call participant-joined maps to ParticipantJoined`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:participant-joined", """{"callId":"c1"}""")
            assertThat(awaitItem()).isEqualTo(CallEvent.ParticipantJoined)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `call signal answer maps to RemoteAnswer`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:signal", """{"callId":"c1","signal":{"type":"answer","sdp":"x"}}""")
            assertThat(awaitItem()).isEqualTo(CallEvent.RemoteAnswer)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `call signal ice-candidate is inert and emits nothing`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:signal", """{"callId":"c1","signal":{"type":"ice-candidate","candidate":"y"}}""")
            expectNoEvents()
        }
    }

    @Test
    fun `call ended with missed reason maps to RingTimeout`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:ended", """{"callId":"c1","reason":"missed"}""")
            assertThat(awaitItem()).isEqualTo(CallEvent.RingTimeout)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `call ended with rejected reason maps to RemoteHangUp`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:ended", """{"callId":"c1","reason":"rejected"}""")
            assertThat(awaitItem()).isEqualTo(CallEvent.RemoteHangUp)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `call missed maps to RingTimeout`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:missed", """{"callId":"c1"}""")
            assertThat(awaitItem()).isEqualTo(CallEvent.RingTimeout)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `call media-toggled is inert and emits nothing`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:media-toggled", """{"callId":"c1","mediaType":"audio","enabled":false}""")
            expectNoEvents()
        }
    }

    @Test
    fun `call error maps to ConnectionFailed carrying the message`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:error", """{"code":"BUSY","message":"Line busy"}""")
            assertThat(awaitItem()).isEqualTo(CallEvent.ConnectionFailed("Line busy"))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `call already-answered maps to RemoteHangUp`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:already-answered", """{"callId":"c1"}""")
            assertThat(awaitItem()).isEqualTo(CallEvent.RemoteHangUp)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a malformed initiated frame missing callId is ignored`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            deliver(handlers, "call:initiated", """{"type":"video"}""")
            expectNoEvents()
        }
    }

    @Test
    fun `a non-JSONObject first arg is ignored without emitting`() = runTest {
        val (managerAndSocket, handlers) = managerWithHandlers()
        managerAndSocket.first.events.test {
            handlers.getValue("call:initiated").invoke(arrayOf("not-an-object"))
            expectNoEvents()
        }
    }

    // --- Outbound: the fire-and-forget emit table mirrors the iOS payload keys ---

    @Test
    fun `emitJoin sends call join with the callId payload`() {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        val payload = slot<JSONObject>()
        manager.emitJoin("call-9")
        verify { socket.emit("call:join", capture(payload)) }
        assertThat(payload.captured.getString("callId")).isEqualTo("call-9")
    }

    @Test
    fun `emitLeave sends call leave with the callId payload`() {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        val payload = slot<JSONObject>()
        manager.emitLeave("call-9")
        verify { socket.emit("call:leave", capture(payload)) }
        assertThat(payload.captured.getString("callId")).isEqualTo("call-9")
    }

    @Test
    fun `emitEnd sends call end with the callId payload`() {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        val payload = slot<JSONObject>()
        manager.emitEnd("call-9")
        verify { socket.emit("call:end", capture(payload)) }
        assertThat(payload.captured.getString("callId")).isEqualTo("call-9")
    }

    @Test
    fun `emitToggleAudio sends callId and enabled flag`() {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        val payload = slot<JSONObject>()
        manager.emitToggleAudio("call-9", enabled = false)
        verify { socket.emit("call:toggle-audio", capture(payload)) }
        assertThat(payload.captured.getString("callId")).isEqualTo("call-9")
        assertThat(payload.captured.getBoolean("enabled")).isFalse()
    }

    @Test
    fun `emitToggleVideo sends callId and enabled flag`() {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        val payload = slot<JSONObject>()
        manager.emitToggleVideo("call-9", enabled = true)
        verify { socket.emit("call:toggle-video", capture(payload)) }
        assertThat(payload.captured.getString("callId")).isEqualTo("call-9")
        assertThat(payload.captured.getBoolean("enabled")).isTrue()
    }

    // --- Outbound: the ACK-based call:initiate ---

    @Test
    fun `emitInitiate emits conversationId and video type and returns the minted call on a valid ACK`() = runTest {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        val payload = slot<JSONObject>()
        every { socket.emit("call:initiate", capture(payload), any()) } answers {
            thirdArg<(Array<Any>) -> Unit>().invoke(
                arrayOf(
                    JSONObject(
                        """{"success":true,"data":{"callId":"call-77","mode":"p2p","ttl":600,"iceServers":[{"urls":"stun:s:1"}]}}""",
                    ),
                ),
            )
        }
        val result = manager.emitInitiate("conv-1", isVideo = true)
        assertThat(payload.captured.getString("conversationId")).isEqualTo("conv-1")
        assertThat(payload.captured.getString("type")).isEqualTo("video")
        val ack = (result as CallInitiateResult.Success).ack
        assertThat(ack.callId).isEqualTo("call-77")
        assertThat(ack.mode).isEqualTo("p2p")
        assertThat(ack.ttlSeconds).isEqualTo(600)
        assertThat(ack.iceServers.single().urls).containsExactly("stun:s:1")
    }

    @Test
    fun `emitInitiate emits audio type when not video`() = runTest {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        val payload = slot<JSONObject>()
        every { socket.emit("call:initiate", capture(payload), any()) } answers {
            thirdArg<(Array<Any>) -> Unit>().invoke(
                arrayOf(JSONObject("""{"success":true,"data":{"callId":"c1"}}""")),
            )
        }
        manager.emitInitiate("conv-1", isVideo = false)
        assertThat(payload.captured.getString("type")).isEqualTo("audio")
    }

    @Test
    fun `emitInitiate surfaces the gateway rejection as ServerError`() = runTest {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        every { socket.emit("call:initiate", any(), any()) } answers {
            thirdArg<(Array<Any>) -> Unit>().invoke(
                arrayOf(JSONObject("""{"success":false,"error":{"message":"Room full"}}""")),
            )
        }
        val result = manager.emitInitiate("conv-1", isVideo = true)
        assertThat(result).isEqualTo(CallInitiateResult.ServerError("Room full"))
    }

    @Test
    fun `emitInitiate returns Timeout when no ACK ever arrives`() = runTest {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, _) = managerAndSocket
        // The relaxed mock's 3-arg emit never invokes the ack callback.
        val result = manager.emitInitiate("conv-1", isVideo = true)
        assertThat(result).isEqualTo(CallInitiateResult.Timeout)
    }

    @Test
    fun `emitInitiate treats a non-JSONObject ACK argument as a Timeout`() = runTest {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        every { socket.emit("call:initiate", any(), any()) } answers {
            thirdArg<(Array<Any>) -> Unit>().invoke(arrayOf("not-an-object"))
        }
        val result = manager.emitInitiate("conv-1", isVideo = true)
        assertThat(result).isEqualTo(CallInitiateResult.Timeout)
    }

    @Test
    fun `emitSignal nests the signal under the callId envelope`() {
        val (managerAndSocket, _) = managerWithHandlers()
        val (manager, socket) = managerAndSocket
        val payload = slot<JSONObject>()
        manager.emitSignal("call-9", JSONObject().put("type", "answer").put("sdp", "blob"))
        verify { socket.emit("call:signal", capture(payload)) }
        assertThat(payload.captured.getString("callId")).isEqualTo("call-9")
        assertThat(payload.captured.getJSONObject("signal").getString("type")).isEqualTo("answer")
        assertThat(payload.captured.getJSONObject("signal").getString("sdp")).isEqualTo("blob")
    }
}
