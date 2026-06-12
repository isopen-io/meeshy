package me.meeshy.sdk.socket

import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore
import org.json.JSONObject
import timber.log.Timber
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

/** Observable connection lifecycle of the realtime socket. */
enum class SocketConnectionState {
    /** No socket, or torn down by an explicit [SocketManager.disconnect]. */
    DISCONNECTED,

    /** Connecting or auto-reconnecting (socket.io retries forever). */
    CONNECTING,

    CONNECTED,
}

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

    private val _connectionState = MutableStateFlow(SocketConnectionState.DISCONNECTED)
    val connectionState: StateFlow<SocketConnectionState> = _connectionState.asStateFlow()

    val isConnected: Boolean get() = _socket?.connected() == true

    fun connect() {
        val token = tokenStore.jwt ?: tokenStore.sessionToken ?: return
        _connectionState.value = SocketConnectionState.CONNECTING
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
            _connectionState.value = SocketConnectionState.CONNECTED
            _connected.tryEmit(Unit)
        }
        socket.on(Socket.EVENT_DISCONNECT) { args ->
            val reason = args.firstOrNull()?.toString() ?: "unknown"
            Timber.d("Socket disconnected: $reason")
            if (_socket === socket) {
                _connectionState.value = SocketConnectionState.CONNECTING
            }
            _disconnected.tryEmit(Unit)
        }
        socket.on(Socket.EVENT_CONNECT_ERROR) { args ->
            Timber.e("Socket connect error: ${args.firstOrNull()}")
            if (_socket === socket) {
                _connectionState.value = SocketConnectionState.CONNECTING
            }
        }
        socket.connect()
    }

    fun disconnect() {
        _socket?.disconnect()
        _socket = null
        _connectionState.value = SocketConnectionState.DISCONNECTED
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
