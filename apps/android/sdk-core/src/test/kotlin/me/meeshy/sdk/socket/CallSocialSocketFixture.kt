package me.meeshy.sdk.socket

import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject

/** Un SocketManager factice : écoutes capturées, émissions enregistrées, accusé scripté. */
internal class FakeCallSocket(
    connected: Boolean = true,
    private val ackReply: JSONObject? = null,
    private val ackSilent: Boolean = false,
) {
    val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
    val emitted = mutableListOf<Pair<String, JSONObject>>()
    val socket: SocketManager = mockk(relaxed = true)

    init {
        every { socket.connectionState } returns MutableStateFlow(
            if (connected) SocketConnectionState.CONNECTED else SocketConnectionState.DISCONNECTED,
        )
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        every { socket.emit(any(), any<JSONObject>()) } answers { emitted += firstArg<String>() to secondArg<JSONObject>() }
        every { socket.emit(any(), any<JSONObject>(), any()) } answers {
            emitted += firstArg<String>() to secondArg<JSONObject>()
            if (!ackSilent) thirdArg<(Array<Any>) -> Unit>().invoke(arrayOf(ackReply ?: JSONObject()))
        }
    }

    fun deliver(event: String, json: String) = handlers.getValue(event).invoke(arrayOf(JSONObject(json)))

    fun last(event: String): JSONObject = emitted.last { it.first == event }.second
}
