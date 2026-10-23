package me.meeshy.sdk.socket

import io.socket.client.IO
import io.socket.client.Socket
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.net.URI
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que [SocketManager] attend d'une socket : le strict nécessaire, sans type Socket.IO exposé. */
interface RealtimeSocket {
    val isConnected: Boolean
    fun on(event: String, listener: (Array<Any>) -> Unit)

    /** Retire TOUS les écouteurs : une socket fermée ne livre plus rien. */
    fun removeAllListeners()
    fun connect()
    fun disconnect()
    fun emit(event: String, data: JSONObject)
    fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit)
}

/** Fabrique injectable : le gestionnaire se teste sans transport. */
fun interface SocketFactory {
    fun create(url: String, auth: Map<String, Any>): RealtimeSocket
}

/**
 * La vraie fabrique : le client OkHttp PARTAGÉ avec REST (prérequis du pinning de certificat)
 * porte le handshake WebSocket.
 */
@Singleton
class IoSocketFactory @Inject constructor(
    private val client: OkHttpClient,
) : SocketFactory {
    override fun create(url: String, auth: Map<String, Any>): RealtimeSocket {
        // Le champ Options.auth est typé Map<String, String>, mais la poignée de main le sérialise
        // en JSON : l'objet `client` imbriqué y passe tel quel.
        @Suppress("UNCHECKED_CAST")
        val handshake = auth as Map<String, String>
        // Une WebSocket reste muette entre deux pings : le délai de lecture REST la tuerait.
        // newBuilder() garde pool, répartiteur et intercepteurs du client partagé.
        val transport = client.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()
        val opts = IO.Options().apply {
            this.auth = handshake
            transports = arrayOf("websocket")
            reconnection = true
            reconnectionAttempts = Int.MAX_VALUE
            reconnectionDelay = 1_000L
            reconnectionDelayMax = 30_000L
            callFactory = transport
            webSocketFactory = transport
        }
        return IoRealtimeSocket(IO.socket(URI.create(url), opts))
    }
}

internal class IoRealtimeSocket(private val socket: Socket) : RealtimeSocket {
    override val isConnected: Boolean get() = socket.connected()

    override fun on(event: String, listener: (Array<Any>) -> Unit) {
        socket.on(event) { args -> listener(args) }
    }

    override fun removeAllListeners() {
        socket.off()
    }

    override fun connect() {
        socket.connect()
    }

    override fun disconnect() {
        socket.disconnect()
    }

    override fun emit(event: String, data: JSONObject) {
        socket.emit(event, data)
    }

    override fun emit(event: String, data: JSONObject, ack: (Array<Any>) -> Unit) {
        socket.emit(event, arrayOf(data)) { args -> ack(args) }
    }
}
