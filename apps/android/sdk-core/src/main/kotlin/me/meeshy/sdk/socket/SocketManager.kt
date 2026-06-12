package me.meeshy.sdk.socket

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore
import org.json.JSONObject
import timber.log.Timber
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages the Socket.IO connection lifecycle (ARCHITECTURE.md §3).
 * All feature socket managers subscribe to [socket] to add their listeners.
 */
@Singleton
class SocketManager @Inject constructor(
    private val config: MeeshyConfig,
    private val tokenStore: TokenStore,
) {
    private var _socket: Socket? = null

    private val _connected = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 1)
    private val _disconnected = MutableSharedFlow<Unit>(replay = 0, extraBufferCapacity = 1)

    val connected: SharedFlow<Unit> = _connected.asSharedFlow()
    val disconnected: SharedFlow<Unit> = _disconnected.asSharedFlow()

    val isConnected: Boolean get() = _socket?.connected() == true

    fun connect() {
        val token = tokenStore.jwt ?: tokenStore.sessionToken ?: return
        val opts = IO.Options().apply {
            auth = mapOf("token" to token)
            transports = arrayOf("websocket")
            reconnection = true
            reconnectionAttempts = Int.MAX_VALUE
            reconnectionDelay = 1_000L
            reconnectionDelayMax = 30_000L
        }
        val socket = IO.socket(URI.create(config.socketUrl), opts)
        _socket = socket

        socket.on(Socket.EVENT_CONNECT) {
            Timber.d("Socket connected")
            _connected.tryEmit(Unit)
        }
        socket.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args.firstOrNull()?.toString() ?: "unknown"
            Timber.d("Socket disconnected: $reason")
            _disconnected.tryEmit(Unit)
        }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Timber.e("Socket connect error: ${args.firstOrNull()}")
        }
        socket.connect()
    }

    fun disconnect() {
        _socket?.disconnect()
        _socket = null
    }

    fun reconnectWithToken() {
        disconnect()
        connect()
    }

    fun on(event: String, callback: (Array<Any>) -> Unit) {
        _socket?.on(event) { args -> callback(args) }
    }

    fun emit(event: String, data: JSONObject) {
        _socket?.emit(event, data)
    }

    fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
        _socket?.emit(event, arrayOf(data)) { args -> ack(args) }
    }

    fun joinRoom(room: String) {
        Timber.d("Socket joining room: $room")
    }
}
